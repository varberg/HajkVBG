class LLMChatModel {
  constructor(options = {}) {
    // Configuration with defaults

    console.log("LLMChatModel constructor", options);

    // Store plugin options (forwarded from props.options)
    this.pluginOptions = options.pluginOptions || {};
    this.baseUrl = this.pluginOptions.baseUrl || "";
    this.clientKey = this.pluginOptions.clientKey || "";
    this.systemMessageTemplate = this.pluginOptions.systemMessageTemplate || "";

    // Validate required config and stop initialization if any missing
    if (!this.baseUrl || !this.clientKey || !this.systemMessageTemplate) {
      // eslint-disable-next-line no-console
      console.error(
        "LLMChatModel: missing one or more of the required options: baseUrl, clientKey, systemMessageTemplate",
        this.pluginOptions
      );
      this.isInitialized = false;
      return;
    }

    // Store map, app, and globalObserver references
    this.map = options.map;
    this.app = options.app;
    this.globalObserver = options.globalObserver;

    // State management
    this.currentConversationId = null;
    this.currentToken = null;
    this.conversationHistory = [];
    this.isInitialized = false;

    // Event callbacks
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onMessageReceived = options.onMessageReceived || (() => {});
    this.onError = options.onError || (() => {});
    this.onConversationCreated = options.onConversationCreated || (() => {});
    this.onShowLayer = options.onShowLayer || (() => {});
  }

  // Utility function to join URLs safely
  joinUrl(base, path) {
    return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }

  // Set status and notify listeners
  setStatus(text) {
    this.onStatusChange(text);
  }

  // Create a new conversation
  async createConversation() {
    try {
      this.setStatus("Creating new conversation...");
      const res = await fetch(this.joinUrl(this.baseUrl, "conversation"), {
        method: "GET",
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `Conversation creation failed: ${res.status} ${errText}`
        );
      }

      const conversationData = await res.json();
      this.currentConversationId = conversationData.conversationId;
      this.conversationHistory = [];
      this.isInitialized = true;

      this.setStatus("Conversation created!");
      this.onConversationCreated(conversationData);

      // Clear status after delay
      setTimeout(() => this.setStatus(""), 1000);

      return conversationData;
    } catch (error) {
      const errorMsg = `Error creating conversation: ${error.message}`;
      this.setStatus(errorMsg);
      this.onError(error);
      throw error;
    }
  }

  // Generate authentication token
  async generateToken() {
    try {
      const res = await fetch(this.joinUrl(this.baseUrl, "token"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Key": this.clientKey,
        },
        body: "{}",
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Token request failed: ${res.status} ${errText}`);
      }

      const data = await res.json();
      this.currentToken = data.token;
      return data.token;
    } catch (error) {
      const errorMsg = `Error generating token: ${error.message}`;
      this.setStatus(errorMsg);
      this.onError(error);
      throw error;
    }
  }

  // Send message to OpenAI API
  async sendMessage(text, model = null, template = null) {
    if (!this.isInitialized || !this.currentConversationId) {
      throw new Error("Please create a conversation first");
    }

    if (!text || !text.trim()) {
      throw new Error("Please enter a message");
    }

    try {
      // Ensure we have a token
      if (!this.currentToken) {
        this.setStatus("Requesting token...");
        await this.generateToken();
      }

      // Add user message to history
      const userMessage = {
        role: "user",
        content: [{ type: "input_text", text: text.trim() }],
        timestamp: new Date().toISOString(),
      };

      // Only add if not a duplicate
      if (!this.isDuplicateMessage(userMessage.content, "user")) {
        this.conversationHistory.push(userMessage);
        this.onMessageReceived(userMessage);
      }

      // Prepare API request
      const body = {
        conversationId: this.currentConversationId,
        input: [{ type: "input_text", text: text.trim() }],
      };

      if (template || this.systemMessageTemplate) {
        body.systemMessageTemplate = template || this.systemMessageTemplate;
      }

      if (model || this.defaultModel) {
        body.model = model || this.defaultModel;
      }

      const doCall = async () => {
        this.setStatus("Calling OpenAI...");
        const res = await fetch(
          this.joinUrl(this.baseUrl, "openai/responses"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.currentToken}`,
            },
            body: JSON.stringify(body),
          }
        );
        return res;
      };

      let res = await doCall();

      // Auto-refresh token on 401 and retry once
      if (!res.ok && res.status === 401) {
        let errPayload = null;
        try {
          errPayload = await res.json();
        } catch (_) {
          // ignore
        }
        const isInvalidToken =
          errPayload?.errorCode === "INVALID_TOKEN" ||
          /invalid token/i.test(errPayload?.error || "");

        if (isInvalidToken) {
          // refresh token and retry once
          this.currentToken = null;
          await this.generateToken();
          res = await doCall();
        }
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`OpenAI call failed: ${res.status} ${errText}`);
      }

      const data = await res.json();

      // Extract assistant response
      const aiText = this.extractAssistantText(data);
      const assistantMessage = {
        role: "assistant",
        content: [{ type: "output_text", text: aiText }],
        timestamp: new Date().toISOString(),
      };

      // Only add if not a duplicate
      if (!this.isDuplicateMessage(assistantMessage.content, "assistant")) {
        this.conversationHistory.push(assistantMessage);
        this.onMessageReceived(assistantMessage);
      }

      this.setStatus("");
      return aiText;
    } catch (error) {
      const errorMsg = `Error: ${error?.message || String(error)}`;
      this.setStatus(errorMsg);
      this.onError(error);
      throw error;
    }
  }

  // Handle "Show Layer" action
  async handleLayerVisibility(item, show) {
    try {
      // Get the map, app, and globalObserver from the model's context
      if (!this.map || !this.app || !this.globalObserver) {
        console.error(
          `Map, app, or globalObserver not available for ${show ? "showing" : "hiding"} layer`
        );
        return;
      }
      // Find the layer by ID
      let layer = this.map
        .getAllLayers()
        .find((l) => l.get("name") === item.id);

      if (!layer) {
        console.error(`Layer with ID "${item.id}" not found.`);
        layer = this.map
          .getAllLayers()
          .find((l) => l.get("name") === item.parentid);
        console.log("found parent layer", layer);
        return;
      }

      // Publish the appropriate layer visibilityy event
      const eventName = show
        ? "layerswitcher.showLayer"
        : "layerswitcher.hideLayer";

      if (layer.get("layerType") === "group") {
        // For group layers, include sublayers info
        const allSubLayers = layer.get("allSubLayers") || [];
        this.globalObserver.publish(eventName, {
          layer,
          subLayersToShow: show ? allSubLayers : [],
        });
      } else {
        // For regular layers, just pass the layer
        this.globalObserver.publish(eventName, layer);
      }
      layer.setVisible(show);

      // Call the callback if provided
      if (this.onShowLayer) {
        this.onShowLayer(item);
      }
    } catch (error) {
      console.error(`Error ${show ? "showing" : "hiding"} layer:`, error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  // Convenience methods for backward compatibility
  async handleShowLayer(item) {
    return this.handleLayerVisibility(item, true);
  }

  async handleHideLayer(item) {
    return this.handleLayerVisibility(item, false);
  }

  // Check if a message is a duplicate
  isDuplicateMessage(content, role) {
    if (!this.conversationHistory.length) return false;

    // Extract text content for comparison
    const newText = Array.isArray(content)
      ? content.find((c) => c.text)?.text || ""
      : content?.text || "";

    // Normalize text for comparison (remove extra whitespace, normalize quotes)
    const normalizeText = (text) => {
      return text
        .trim()
        .replace(/\s+/g, " ")
        .replace(/["""]/g, '"')
        .replace(/[''']/g, "'");
    };

    const normalizedNew = normalizeText(newText);

    // Check against all recent messages of the same role (last 5 messages)
    const recentMessages = this.conversationHistory
      .filter((msg) => msg.role === role)
      .slice(-5);

    for (const msg of recentMessages) {
      const lastText = Array.isArray(msg.content)
        ? msg.content.find((c) => c.text)?.text || ""
        : msg.content?.text || "";

      const normalizedLast = normalizeText(lastText);

      // Check for exact match or very similar content (90% similarity)
      if (normalizedNew === normalizedLast) return true;

      // Check if new text is contained within last text or vice versa
      if (
        normalizedNew.includes(normalizedLast) ||
        normalizedLast.includes(normalizedNew)
      ) {
        return true;
      }

      // Check for high similarity (simple character-based similarity)
      const similarity = this.calculateSimilarity(
        normalizedNew,
        normalizedLast
      );
      if (similarity > 0.9) return true;
    }

    return false;
  }

  // Calculate simple text similarity (0-1)
  calculateSimilarity(text1, text2) {
    if (text1 === text2) return 1;
    if (text1.length === 0 || text2.length === 0) return 0;

    const longer = text1.length > text2.length ? text1 : text2;
    const shorter = text1.length > text2.length ? text2 : text1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  // Simple Levenshtein distance calculation
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  // Safely extract the assistant text from Responses API payload
  extractAssistantText(data) {
    // Handle different response structures
    if (Array.isArray(data.output)) {
      // Find the most recent message with content
      const messages = data.output
        .filter((o) => o && o.type === "message" && o.content)
        .sort((a, b) => {
          // Sort by ID to get the most recent (assuming IDs contain timestamps)
          return (b.id || "").localeCompare(a.id || "");
        });

      if (messages.length > 0) {
        const latestMessage = messages[0];
        const content0 = latestMessage.content?.[0];
        if (
          content0 &&
          content0.type === "output_text" &&
          typeof content0.text === "string"
        ) {
          return content0.text;
        }
      }
    }

    // fallbacks
    if (typeof data.output_text === "string") return data.output_text;
    if (data.text && typeof data.text.value === "string")
      return data.text.value;
    return "No response text found";
  }

  // Get conversation history
  getConversationHistory() {
    return [...this.conversationHistory];
  }

  // Clear conversation history
  clearHistory() {
    this.conversationHistory = [];
  }

  // Get current conversation ID
  getCurrentConversationId() {
    return this.currentConversationId;
  }

  // Check if conversation is initialized
  isConversationInitialized() {
    return this.isInitialized;
  }

  // Update configuration
  updateConfig(newConfig) {
    if (newConfig.baseUrl) this.baseUrl = newConfig.baseUrl;
    if (newConfig.clientKey) this.clientKey = newConfig.clientKey;
    if (newConfig.systemMessageTemplate)
      this.systemMessageTemplate = newConfig.systemMessageTemplate;
    if (newConfig.defaultModel) this.defaultModel = newConfig.defaultModel;
  }

  // Reset the model state
  reset() {
    this.currentConversationId = null;
    this.currentToken = null;
    this.conversationHistory = [];
    this.isInitialized = false;
  }
}

export default LLMChatModel;
