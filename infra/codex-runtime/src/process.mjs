import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

// No inherited credentials, plugins, user config, or arbitrary execution tools.
export const CONFIG = `cli_auth_credentials_store = "file"
forced_login_method = "chatgpt"
approval_policy = "on-request"
sandbox_mode = "read-only"
web_search = "disabled"
[features]
shell_tool = false
unified_exec = false
shell_snapshot = false
apps = false
plugins = false
remote_plugin = false
computer_use = false
browser_use = false
browser_use_external = false
in_app_browser = false
image_generation = false
view_image = false
code_mode = false
code_mode_host = false
hooks = false
multi_agent = false
[sandbox_workspace_write]
network_access = false
`;

export class CodexProcess extends EventEmitter {
  static async start({ root, executable = "codex" }) {
    const home = join(root, "auth");
    const cwd = join(root, "work");
    await mkdir(home, { recursive: true, mode: 0o700 });
    await mkdir(cwd, { recursive: true, mode: 0o700 });
    await writeFile(join(home, "config.toml"), CONFIG, { mode: 0o600 });
    const child = spawn(executable, ["app-server", "--listen", "stdio://"], {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: root,
        CODEX_HOME: home,
        LANG: "C.UTF-8",
      },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const rpc = new CodexProcess(child, cwd);
    try {
      await rpc.call("initialize", {
        clientInfo: { name: "delulu", title: "Delulu", version: "1.0.0" },
        capabilities: { experimentalApi: true },
      });
    } catch (error) {
      await rpc.close();
      throw error;
    }
    rpc.notify("initialized", {});
    return rpc;
  }
  constructor(child, cwd) {
    super();
    this.child = child;
    this.cwd = cwd;
    this.pending = new Map();
    this.sequence = 0;
    this.closed = false;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (message.method && message.id !== undefined) {
          this.emit("request", message);
        } else if (message.method) {
          this.emit("notification", message);
        } else {
          const pending = this.pending.get(message.id);
          if (!pending) {
            return;
          }
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.error) {
            pending.reject(new Error("Codex RPC failed"));
          } else {
            pending.resolve(message.result);
          }
        }
      } catch {
        this.close();
      }
    });
    const exited = () => {
      if (this.closed) {
        return;
      }
      this.closed = true;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Codex process stopped"));
      }
      this.pending.clear();
      this.emit("stopped");
    };
    child.on("error", exited);
    child.on("exit", exited);
    child.stdin.on("error", exited);
  }
  send(message) {
    if (this.closed) {
      throw new Error("Codex process stopped");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  notify(method, params) {
    this.send({ method, params });
  }
  reply(id, result) {
    this.send({ id, result });
  }
  reject(id) {
    this.send({ id, error: { code: -32_601, message: "Tool unavailable" } });
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex RPC timed out"));
      }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  close() {
    if (this.closed) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.child.once("exit", resolve);
      this.child.kill("SIGKILL");
    });
  }
}
