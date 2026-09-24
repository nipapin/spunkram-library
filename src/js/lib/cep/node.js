// Abstracted built-in Node.js Modules
//@ts-ignore
export const crypto = (typeof window.cep !== "undefined" ? require("crypto") : {});
export const assert = (typeof window.cep !== "undefined" ? require("assert") : {});
export const buffer = (typeof window.cep !== "undefined" ? require("buffer") : {});
export const child_process = (typeof window.cep !== "undefined" ? require("child_process") : {});
export const cluster = (typeof window.cep !== "undefined" ? require("cluster") : {});
export const dgram = (typeof window.cep !== "undefined" ? require("dgram") : {});
export const dns = (typeof window.cep !== "undefined" ? require("dns") : {});
export const domain = (typeof window.cep !== "undefined" ? require("domain") : {});
export const events = (typeof window.cep !== "undefined" ? require("events") : {});
export const fs = (typeof window.cep !== "undefined" ? require("fs") : {});
export const http = (typeof window.cep !== "undefined" ? require("http") : {});
export const https = (typeof window.cep !== "undefined" ? require("https") : {});
export const net = (typeof window.cep !== "undefined" ? require("net") : {});
export const os = (typeof window.cep !== "undefined" ? require("os") : {});
export const path = (typeof window.cep !== "undefined" ? require("path") : {});
export const punycode = (typeof window.cep !== "undefined" ? require("punycode") : {});
export const querystring = (typeof window.cep !== "undefined" ? require("querystring") : {});
export const readline = (typeof window.cep !== "undefined" ? require("readline") : {});
export const stream = (typeof window.cep !== "undefined" ? require("stream") : {});
export const string_decoder = (typeof window.cep !== "undefined" ? require("string_decoder") : {});
export const timers = (typeof window.cep !== "undefined" ? require("timers") : {});
export const tls = (typeof window.cep !== "undefined" ? require("tls") : {});
export const tty = (typeof window.cep !== "undefined" ? require("tty") : {});
export const url = (typeof window.cep !== "undefined" ? require("url") : {});
export const util = (typeof window.cep !== "undefined" ? require("util") : {});
export const v8 = (typeof window.cep !== "undefined" ? require("v8") : {});
export const vm = (typeof window.cep !== "undefined" ? require("vm") : {});
export const zlib = (typeof window.cep !== "undefined" ? require("zlib") : {});
/** Node `process.env` exposed by CEP — never use bare global `process` in panel code. */
export function cepProcessEnv() {
    try {
        const env = window.cep_node?.process?.env;
        return env && typeof env === "object" ? env : {};
    }
    catch {
        return {};
    }
}
