import { startProxy } from "../src/proxy.js";

startProxy(Number(process.env.PROXY_PORT || 4102));
