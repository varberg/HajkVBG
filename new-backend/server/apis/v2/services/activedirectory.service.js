import log4js from "log4js";
import adgroupheader from "./adgroupheader.service.js";

const logger = log4js.getLogger("service.auth.v2");

// NOTE! This is a modded version of the file that uses the psad service.

class ActiveDirectoryService {
  constructor() {
    if (process.env.AD_LOOKUP_ACTIVE !== "true") {
      logger.info(
        "AD_LOOKUP_ACTIVE is set to %o in .env. Not enabling ActiveDirectory authentication.",
        process.env.AD_LOOKUP_ACTIVE
      );
      return;
    }

    logger.trace("Initiating ActiveDirectoryService");
    logger.trace("Running patched adgroupheader version.");
  }

  async getStore() {
    logger.warn("getStore: is not implemented");
    return null;
  }

  async flushStores() {
    logger.warn("flushStores: is not implemented");
    return null;
  }

  async isUserValid(sAMAccountName) {
    return adgroupheader.getUser(sAMAccountName);
  }

  async findUser(sAMAccountName) {
    return adgroupheader.getUser(sAMAccountName) ? {} : null;
  }

  async getGroupMembershipForUser(sAMAccountName) {
    return adgroupheader.getGroupMembershipForUser(sAMAccountName);
  }

  async isUserMemberOf(sAMAccountName, groupCN) {
    return adgroupheader.getUserIsMemberOfGroup(sAMAccountName, groupCN);
  }

  async getAvailableADGroups() {
    logger.warn("getAvailableADGroups: is not implemented");
    return [];
  }

  async findCommonADGroupsForUsers() {
    logger.warn("findCommonADGroupsForUsers: is not implemented");
    return [];
  }

  getUserFromRequestHeader(req) {
    if (process.env.AD_LOOKUP_ACTIVE !== "true") {
      // If AD_LOOKUP_ACTIVE is anything else than "true", we don't care
      // about doing any username checks. Just return undefined as username.
      return undefined;
    } else {
      // AD authentication is active.
      //
      // First see if webmaster wants to override the header value (useful for developing and testing)
      if (
        process.env.AD_OVERRIDE_USER_WITH_VALUE !== undefined &&
        process.env.AD_OVERRIDE_USER_WITH_VALUE.trim().length !== 0
      ) {
        logger.warn(
          'AD_OVERRIDE_USER_WITH_VALUE is set in .env! Will use "%s" as user name for all AD functions. DON\'T USE THIS IN PRODUCTION!',
          process.env.AD_OVERRIDE_USER_WITH_VALUE
        );

        return process.env.AD_OVERRIDE_USER_WITH_VALUE;
      }

      // Now it's time to take care of the _real_ AD authentication!
      //
      // AD_LOOKUP_ACTIVE is "true" so let's find out a couple of things.
      // 1. Do we only accept requests from certain IPs? If so, check that
      // request comes from accepted IP. If not, abort.
      // 2. If we passed the first check (either because request comes from
      // accepted IP, or because we accept any IPs (dangerous!)) we can now
      // take care of finding out the user name. It will be read from a REQ
      // header.
      //
      // Implementation follows.

      // Step 1: See if the current req IP is within the accepted IPs range
      //
      // Note that we'll be using req.connection.remoteAddress and not req.ip,
      // because we're really interested of the last node that makes the actual
      // request to this service (because it can modify the X-Control-Header).
      // req.ip will render different values, depending on "trust proxy" setting,
      // and it can in fact contain the value of X-Forwarded-For, which we don't care
      // about in this case. We _really_ want to know who's the last node on the line
      // and req.connection.remoteAddress gives us that.
      const requestComesFromAcceptedIP =
        process.env.AD_TRUSTED_PROXY_IPS === undefined || // If no IPs are specified, because variable isn't set,
        process.env.AD_TRUSTED_PROXY_IPS.trim().length === 0 || // or because it's an empty string, it means that we accept any IP (dangerous!).
        process.env.AD_TRUSTED_PROXY_IPS?.split(",").includes(
          req.connection.remoteAddress
        ); // Else, if specified, split on comma and see if IP exists in list

      // Abort if request comes from unaccepted IP range
      if (requestComesFromAcceptedIP === false) {
        const e = new Error(
          `[getUserFromRequestHeader] AD authentication does not allow requests from ${req.connection.remoteAddress}. Aborting.`
        );
        logger.error(e.message);
        throw e;
      }

      // If we got this far, we've got through the check above. But we should ensure
      // that IP range really is configured - if not we should print an additional
      // warning in the log, so that admin is aware of this possible misconfiguration.
      if (
        process.env.AD_TRUSTED_PROXY_IPS === undefined ||
        process.env.AD_TRUSTED_PROXY_IPS.trim().length === 0
      ) {
        logger.warn(
          `[getUserFromRequestHeader] AD authentication is active but no IP range restriction is set in .env. 
                          ***This means that you accept the value of X-Control-Header from any request, which is potentially a huge security risk!***`
        );
      }

      logger.trace(
        `[getUserFromRequestHeader] Request from ${req.connection.remoteAddress} accepted by AD`
      );

      // See which header we should be looking into
      const xControlHeader =
        process.env.AD_TRUSTED_HEADER || "X-Control-Header";

      const xControlGroupHeader =
        process.env.AD_TRUSTED_GROUP_HEADER || "X-Control-Group-Header";

      // The user will only be set only if request comes from accepted IP.
      // Else, we'll send undefined as user parameter, which will in turn lead
      // to errors being thrown (if AD auth is required in .env)
      let user =
        (requestComesFromAcceptedIP && req.get(xControlHeader)) || undefined;
      logger.trace(
        "[getUserFromRequestHeader] User Header %s has value: %o",
        process.env.AD_TRUSTED_HEADER,
        user
      );

      const groups = [];
      if (user) {
        const groupString = req.get(xControlGroupHeader);
        if (groupString) {
          groupString.split(",").forEach((group) => {
            groups.push(group.trim());
          });
        }
        logger.trace(
          "[getUserFromRequestHeader] Group Header %s has value: %o",
          process.env.AD_TRUSTED_GROUP_HEADER,
          groupString
        );
      }

      // user = "jead003";
      // adgroupheader.setUserGroups(user, "a,b,c,d");

      // Check if the user-value contains backslash (we might get DOMAIN\userName in the header, and if we do
      // we want to remove the domain).
      if (user?.match(/\\/)) {
        logger.trace(
          "[getUserFromRequestHeader] Username from header contains backslash. Removing everything before the last backslash."
        );
        // Split the string on \
        const userParts = user.split("\\");
        // Return the string after the last \
        user = userParts[userParts.length - 1];
      }

      adgroupheader.setUserGroups(user, groups);
      // If not, remove the user as-is.
      return user;
    }
  }
}

export default new ActiveDirectoryService();
