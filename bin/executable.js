#!/usr/bin/env node

import fs from "fs";
import readline from "readline";
import { execFileSync } from "child_process";
import Handlebars from "handlebars";

// Keys that must not become template variables. These are this command's own
// control flags, plus the variables aux4 itself injects into value(*):
//   - packageDir, aux4HomeDir, configDir : always injected by aux4
//   - config, configFile                 : present when the config integration is used
//   - response                           : set by aux4 from a previous execute line
const RESERVED = new Set([
  "file",
  "data",
  "output",
  "inputStream",
  "response",
  "packageDir",
  "aux4HomeDir",
  "configDir",
  "config",
  "configFile"
]);

// Keys that must never be copied into a context object, to avoid touching an
// object's prototype when merging untrusted JSON / flags.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Only these values are considered false by the bool helper; everything else
// (including arbitrary non-empty strings) is true.
const FALSY = new Set(["", "false", "0", "no", "off", "null", "undefined", "nan"]);

function fail(message, code) {
  console.error(message);
  process.exit(code || 1);
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  return !FALSY.has(String(value).trim().toLowerCase());
}

// Parse a value into a Date. Numeric input is treated as epoch milliseconds;
// everything else is parsed as a date string. Returns null when invalid.
function parseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  let date;
  if (typeof value === "number") {
    date = new Date(value);
  } else {
    const str = String(value).trim();
    date = /^-?\d+$/.test(str) ? new Date(Number(str)) : new Date(str);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date, format) {
  const pad = (n, len) => String(n).padStart(len || 2, "0");
  const tokens = {
    YYYY: date.getUTCFullYear(),
    MM: pad(date.getUTCMonth() + 1),
    DD: pad(date.getUTCDate()),
    HH: pad(date.getUTCHours()),
    mm: pad(date.getUTCMinutes()),
    ss: pad(date.getUTCSeconds())
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, token => tokens[token]);
}

// CLI flags arrive as strings. Object/array values are passed as JSON strings
// (e.g. --items '["a","b"]'), so parse anything that looks like a JSON object
// or array; leave plain scalars (names, numbers as text) untouched.
function coerce(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

// Extract the context params (everything that is not a reserved control flag)
// from the value(*) object, coercing JSON-looking values.
function extractFlags(allParamsJson) {
  const flags = {};
  let parsed;
  try {
    parsed = JSON.parse(allParamsJson);
  } catch {
    return flags;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return flags;
  for (const [key, value] of Object.entries(parsed)) {
    if (RESERVED.has(key) || UNSAFE_KEYS.has(key)) continue;
    flags[key] = coerce(value);
  }
  return flags;
}

// --data <file>: a single JSON object used as the base context. Stream records
// and CLI flags are layered on top of it.
function loadData(dataPath) {
  if (!dataPath) return {};
  if (!fs.existsSync(dataPath)) {
    fail(`Data file not found: ${dataPath}`, 4);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (e) {
    fail(`Failed to parse --data file ${dataPath}: ${e.message}`, 6);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`--data must contain a JSON object (got ${Array.isArray(parsed) ? "array" : typeof parsed}). Use stdin for a stream of records.`, 6);
  }
  return parsed;
}

// Merge context layers without copying prototype-polluting keys.
function mergeContext(...layers) {
  const context = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (UNSAFE_KEYS.has(key)) continue;
      context[key] = value;
    }
  }
  return context;
}

function registerHelpers() {
  // {{aux4 "command" "arg" ...}} runs `aux4 command arg ...` and inlines its
  // stdout (trailing newlines trimmed) into the rendered output.
  Handlebars.registerHelper("aux4", function (...args) {
    args.pop(); // Handlebars passes an options object as the last argument.
    const cmdArgs = args.map(arg => String(arg));
    if (cmdArgs.length === 0) {
      throw new Error("aux4 helper requires at least one argument, e.g. {{aux4 \"version\"}}");
    }
    let output;
    try {
      // stdin: "ignore" so a nested aux4 command never consumes the parent's
      // stdin (which may be an in-flight stream of records being rendered).
      output = execFileSync("aux4", cmdArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      throw new Error(`aux4 helper failed running "aux4 ${cmdArgs.join(" ")}": ${e.message}`);
    }
    return new Handlebars.SafeString(output.replace(/\n+$/, ""));
  });

  // {{bool flag}} / {{#if (bool flag)}} — interpret a value as a real boolean.
  Handlebars.registerHelper("bool", value => toBool(value));

  // {{int value}} — parse an integer; renders nothing when not a number.
  Handlebars.registerHelper("int", value => {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? "" : n;
  });

  // {{number value}} — parse a float; renders nothing when not a number.
  Handlebars.registerHelper("number", value => {
    const n = parseFloat(value);
    return Number.isNaN(n) ? "" : n;
  });

  // {{json value}} — JSON-stringify a value. {{json value indent=2}} to pretty-print.
  Handlebars.registerHelper("json", function (value, options) {
    const indent = options && options.hash ? options.hash.indent : undefined;
    return new Handlebars.SafeString(JSON.stringify(value, null, indent != null ? Number(indent) : undefined));
  });

  // {{date value}} -> ISO string. {{date value "YYYY-MM-DD HH:mm:ss"}} to format (UTC).
  Handlebars.registerHelper("date", function (value, format) {
    const date = parseDate(value);
    if (!date) return "";
    if (typeof format !== "string") return date.toISOString();
    return formatDate(date, format);
  });

  // {{timestamp value}} -> Unix epoch in seconds for the given date.
  Handlebars.registerHelper("timestamp", value => {
    const date = parseDate(value);
    return date ? Math.floor(date.getTime() / 1000) : "";
  });
}

function main() {
  const args = process.argv.slice(2);
  const action = args[0];

  if (action !== "render") {
    fail(`Invalid action: ${action}. Use "render".`, 2);
  }

  const file = args[1];
  const dataPath = args[2] || "";
  const outputPath = args[3] || "";
  const inputStream = args[4] || "";
  const allParamsJson = args[5] || "{}";

  if (!file) {
    fail("No template file provided. Use --file <path>.", 3);
  }
  if (!fs.existsSync(file)) {
    fail(`Template file not found: ${file}`, 4);
  }
  if (fs.statSync(file).isDirectory()) {
    fail(`Template path is a directory, not a file: ${file}`, 4);
  }

  registerHelpers();

  let template;
  try {
    // noEscape: this renders arbitrary text/files, not HTML, so "&", "<", ">"
    // must pass through verbatim.
    template = Handlebars.compile(fs.readFileSync(file, "utf8"), { noEscape: true });
  } catch (e) {
    fail(`Failed to compile template: ${e.message}`, 5);
  }

  const flags = extractFlags(allParamsJson);
  const base = loadData(dataPath);

  // --output <file> opens once and truncates (like "> file"); every rendered
  // record is written to it in order. Without --output, render to stdout.
  const sink = outputPath ? fs.createWriteStream(outputPath, { flags: "w" }) : null;
  if (sink) {
    sink.on("error", e => fail(`Failed to write --output file ${outputPath}: ${e.message}`, 8));
  }
  const writable = sink || process.stdout;
  if (!sink) {
    // A downstream consumer (e.g. `| head`) closing early is normal, not an error.
    process.stdout.on("error", e => {
      if (e.code === "EPIPE") process.exit(0);
      fail(`Failed to write output: ${e.message}`, 8);
    });
  }
  const finish = () => {
    if (sink) sink.end();
  };

  // A single render is byte-exact. For a stream, records are separated by a
  // newline only when the previous render did not already end with one, so the
  // template still controls its own trailing whitespace.
  let started = false;
  let lastEndedWithNewline = true;
  let lastWriteOk = true;
  const emit = text => {
    let chunk = "";
    if (started && !lastEndedWithNewline) chunk += "\n";
    chunk += text;
    started = true;
    if (text.length > 0) lastEndedWithNewline = text.endsWith("\n");
    lastWriteOk = writable.write(chunk);
  };

  // Precedence (low -> high): --data base < stdin record < --param flags.
  const renderRecord = record => {
    try {
      emit(template(mergeContext(base, record, flags)));
    } catch (e) {
      fail(`Failed to render template: ${e.message}`, 5);
    }
  };

  const requireObject = value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail(`Each stream record must be a JSON object (got ${Array.isArray(value) ? "array" : typeof value}).`, 7);
    }
  };

  // Stdin is only consumed when --inputStream is enabled. Otherwise render once
  // from --data + flags and never touch stdin, so flag-only use is safe even
  // inside a pipeline (e.g. a `... | while read` loop).
  if (!toBool(inputStream)) {
    renderRecord({});
    finish();
    return;
  }

  // Streaming mode: read stdin and render once per JSON record. Each line is
  // accumulated until it parses, so this handles NDJSON (one object per line),
  // compact single-line JSON, multi-line objects, and a top-level JSON array.
  let buffer = "";
  let count = 0;
  let draining = false;

  const emitRecords = value => {
    if (Array.isArray(value)) {
      value.forEach(item => {
        requireObject(item);
        renderRecord(item);
        count++;
      });
    } else {
      requireObject(value);
      renderRecord(value);
      count++;
    }
  };

  const rl = readline.createInterface({ input: process.stdin });

  process.stdin.on("error", e => fail(`Failed to read stdin: ${e.message}`, 9));
  rl.on("error", e => fail(`Failed to read stream input: ${e.message}`, 9));

  rl.on("line", line => {
    buffer += line + "\n";
    if (buffer.trim() === "") {
      buffer = "";
      return;
    }
    let value;
    try {
      value = JSON.parse(buffer);
    } catch {
      return; // Incomplete JSON: keep accumulating lines.
    }
    buffer = "";
    emitRecords(value);
    // Apply backpressure: stop reading stdin until the output drains so large
    // streams stay constant-memory instead of buffering in the writable. Guard
    // with `draining` so only one drain listener is ever registered at a time.
    if (!lastWriteOk && !draining) {
      draining = true;
      rl.pause();
      writable.once("drain", () => {
        draining = false;
        rl.resume();
      });
    }
  });

  rl.on("close", () => {
    const rest = buffer.trim();
    if (rest !== "") {
      let value;
      try {
        value = JSON.parse(rest);
      } catch (e) {
        fail(`Invalid JSON in stream input: ${e.message}`, 7);
      }
      emitRecords(value);
    }
    // Empty stdin (e.g. "< /dev/null"): behave like the no-stdin case.
    if (count === 0) {
      renderRecord({});
    }
    finish();
  });
}

main();
