import * as express from "express";

import { aiLimiter } from "../../../../common/middlewares/rate.limiter.js";
import controller from "./controller.ts";

export default express.Router().post("/chat", aiLimiter, controller.chat);
