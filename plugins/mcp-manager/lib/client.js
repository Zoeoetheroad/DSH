window.__ModuleLoader__.load({
	id: "dsh-local-mcp-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");

		var API = "/api/mcp-manager/servers";

		var ERROR_TEXT = {
			"bad-server-name": "名称不合法：只能用字母、数字、下划线、连字符，1–32 位。",
			"duplicate-server-name": "这个名称已经有了，换一个。",
			"bad-transport": "请选择连接方式。",
			"command-required": "stdio 方式必须填命令。",
			"url-required": "HTTP 方式必须填 URL。",
			"yaml-unavailable": "读取配置失败（宿主侧解析 YAML 不可用）。",
			"write-failed": "写入配置失败。",
			"not-found": "这条服务器已经不在了，刷新一下。",
		};

		function message(error, detail) {
			return (ERROR_TEXT[error] || ("操作失败：" + error)) + (detail ? "  [" + detail + "]" : "");
		}

		/* ---- styles (one tag, deduped) ---------------------------------- */
		var CSS = [
			".lmcp_root { display:flex; flex-direction:column; gap:14px; }",
			".lmcp_head { display:flex; align-items:center; justify-content:space-between; gap:12px; }",
			".lmcp_title { font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary); }",
			".lmcp_note { font-size:12px; line-height:18px; color:var(--dsw-alias-label-tertiary); }",
			".lmcp_path { font-family:var(--dsh-font-mono,monospace); font-size:11px; color:var(--dsw-alias-label-caption); word-break:break-all; }",
			".lmcp_list { display:flex; flex-direction:column; gap:6px; }",
			".lmcp_item { box-sizing:border-box; display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:var(--dsw-alias-interactive-bg-hover); border:.5px solid var(--dsw-alias-border-l1); }",
			".lmcp_itemName { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }",
			".lmcp_name { color:var(--dsw-alias-label-primary); font-size:14px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }",
			".lmcp_meta { color:var(--dsw-alias-label-tertiary); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }",
			".lmcp_badge { flex:none; font-size:11px; padding:2px 7px; border-radius:999px; background:var(--dsw-alias-button-ghost-active-fill); color:var(--dsw-alias-label-caption); }",
			".lmcp_empty { padding:18px 12px; text-align:center; color:var(--dsw-alias-label-tertiary); font-size:13px; border:1px dashed var(--dsw-alias-border-l2); border-radius:10px; }",
			".lmcp_btn { box-sizing:border-box; cursor:pointer; font:inherit; font-size:13px; border-radius:8px; padding:6px 12px; border:.5px solid var(--dsw-alias-border-l3); background:var(--dsw-alias-button-elevated-fill); color:var(--dsw-alias-label-primary); }",
			".lmcp_btn:hover { background:var(--dsw-alias-interactive-bg-hover); }",
			".lmcp_btn[disabled] { opacity:.5; cursor:default; }",
			".lmcp_btnDanger { border-color:transparent; background:transparent; color:var(--dsw-alias-label-tertiary); padding:4px 8px; font-size:12px; }",
			".lmcp_btnDanger:hover { background:var(--dsw-alias-interactive-bg-hover-danger); color:var(--dsw-alias-state-error-primary); }",
			".lmcp_form { display:flex; flex-direction:column; gap:10px; padding:12px; border-radius:10px; border:.5px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); }",
			".lmcp_row { display:flex; align-items:center; gap:10px; }",
			".lmcp_label { flex:none; width:88px; font-size:13px; color:var(--dsw-alias-label-secondary); }",
			".lmcp_input, .lmcp_select { box-sizing:border-box; flex:1; min-width:0; height:32px; padding:0 10px; font:inherit; font-size:13px; border-radius:8px; border:.5px solid var(--dsw-alias-border-l3); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); }",
			".lmcp_error { color:var(--dsw-alias-state-error-primary); font-size:12px; line-height:18px; }",
			".lmcp_ok { color:var(--dsw-alias-state-success-primary); font-size:12px; }",
			".lmcp_actions { display:flex; gap:8px; justify-content:flex-end; }",
		].join("\n");

		var TAG_ID = "dsh-local-mcp-manager/settings.css";
		(function injectStyles() {
			if (typeof document === "undefined") return;
			if (document.querySelector('style[data-plugin-css="' + TAG_ID + '"]') !== null) return;
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-local-mcp-manager";
			tag.dataset.pluginCss = TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		})();

		/* ---- the settings page ------------------------------------------- */
		function McpSettings() {
			var [state, setState] = React.useState({ status: "loading", servers: [], patchFile: "", error: "" });
			var [draft, setDraft] = React.useState({ serverName: "", transport: "stdio", command: "", args: "", url: "", headers: "", env: "" });
			var [busy, setBusy] = React.useState(false);
			var [notice, setNotice] = React.useState(null);

			var refresh = React.useCallback(function () {
				fetch(API, { headers: { accept: "application/json" } })
					.then(function (r) { return r.json(); })
					.then(function (body) {
						if (!body || body.ok !== true) {
							setState({ status: "error", servers: [], patchFile: "", error: message(body && body.error) });
							return;
						}
						setState({ status: "ready", servers: body.servers || [], patchFile: body.patchFile || "", error: "" });
					})
					.catch(function (e) {
						setState({ status: "error", servers: [], patchFile: "", error: message("write-failed", String(e && e.message)) });
					});
			}, []);

			React.useEffect(function () { refresh(); }, [refresh]);

			function post(payload) {
				setBusy(true); setNotice(null);
				fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
					.then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
					.then(function (out) {
						if (!out.body || out.body.ok !== true) {
							setNotice({ kind: "error", text: message(out.body && out.body.error, out.body && out.body.detail) });
							return;
						}
						setNotice({ kind: "ok", text: payload.action === "add" ? "已添加，正在挂载…" : "已删除。" });
						if (payload.action === "add") setDraft({ serverName: "", transport: "stdio", command: "", args: "", url: "", headers: "", env: "" });
						refresh();
					})
					.catch(function (e) { setNotice({ kind: "error", text: String(e && e.message) }); })
					.then(function () { setBusy(false); });
			}

			function toPairs(text) {
				var out = {};
				text.split("\n").forEach(function (line) {
					var i = line.indexOf("=");
					if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
				});
				return out;
			}

			function submit() {
				var server = { serverName: draft.serverName.trim(), transport: draft.transport };
				if (draft.transport === "stdio") {
					server.command = draft.command.trim();
					if (draft.args.trim() !== "") server.args = draft.args.trim().split(/\s+/);
					if (draft.env.trim() !== "") server.env = toPairs(draft.env);
				} else {
					server.url = draft.url.trim();
					if (draft.headers.trim() !== "") server.headers = toPairs(draft.headers);
				}
				post({ action: "add", server: server });
			}

			var set = function (key) { return function (e) { setDraft(Object.assign({}, draft, { [key]: e.target.value })); }; };

			var items = state.servers.map(function (s) {
				var meta = s.transport === "stdio"
					? (s.command || "") + (s.args && s.args.length ? " " + s.args.join(" ") : "")
					: (s.url || "");
				return React.createElement("div", { className: "lmcp_item", key: s.serverName },
					React.createElement("div", { className: "lmcp_itemName" },
						React.createElement("div", { className: "lmcp_name" }, s.serverName),
						React.createElement("div", { className: "lmcp_meta" }, meta || "—")),
					React.createElement("span", { className: "lmcp_badge" }, s.transport === "stdio" ? "stdio" : "HTTP"),
					React.createElement("button", {
						className: "lmcp_btn lmcp_btnDanger",
						disabled: busy,
						onClick: function () { post({ action: "remove", serverName: s.serverName }); },
					}, "删除"));
			});

			var fields = draft.transport === "stdio"
				? [
					["命令 command", "command", "npx"],
					["参数 args", "args", "-y @modelcontextprotocol/server-github"],
					["环境变量 env", "env", "GITHUB_TOKEN=xxx（每行一个 KEY=VALUE）"],
				]
				: [
					["URL", "url", "https://example.com/mcp"],
					["请求头 headers", "headers", "Authorization=Bearer xxx（每行一个）"],
				];

			return React.createElement("div", { className: "lmcp_root" },
				React.createElement("div", { className: "lmcp_head" },
					React.createElement("div", null,
						React.createElement("div", { className: "lmcp_title" }, "MCP 服务器"),
						React.createElement("div", { className: "lmcp_note" }, "每台服务器一条配置，工具会以 mcp__<名称>__<工具> 出现。保存后自动挂载，无需重启。")),
					React.createElement("button", { className: "lmcp_btn", disabled: busy, onClick: refresh }, "刷新")),

				state.status === "error" ? React.createElement("div", { className: "lmcp_error" }, state.error) : null,

				state.servers.length === 0 && state.status === "ready"
					? React.createElement("div", { className: "lmcp_empty" }, "还没有配置任何 MCP 服务器")
					: React.createElement("div", { className: "lmcp_list" }, items),

				React.createElement("div", { className: "lmcp_form" },
					React.createElement("div", { className: "lmcp_title" }, "添加服务器"),
					React.createElement("div", { className: "lmcp_row" },
						React.createElement("span", { className: "lmcp_label" }, "名称"),
						React.createElement("input", { className: "lmcp_input", value: draft.serverName, placeholder: "github", onChange: set("serverName") })),
					React.createElement("div", { className: "lmcp_row" },
						React.createElement("span", { className: "lmcp_label" }, "连接方式"),
						React.createElement("select", { className: "lmcp_select", value: draft.transport, onChange: set("transport") },
							React.createElement("option", { value: "stdio" }, "stdio（本地命令）"),
							React.createElement("option", { value: "streamable-http" }, "Streamable HTTP（远程地址）"))),
					fields.map(function (f) {
						return React.createElement("div", { className: "lmcp_row", key: f[1] },
							React.createElement("span", { className: "lmcp_label" }, f[0]),
							f[1] === "env" || f[1] === "headers"
								? React.createElement("textarea", { className: "lmcp_input", style: { height: "auto", minHeight: "56px", padding: "6px 10px" }, value: draft[f[1]], placeholder: f[2], onChange: set(f[1]) })
								: React.createElement("input", { className: "lmcp_input", value: draft[f[1]], placeholder: f[2], onChange: set(f[1]) }));
					}),
					notice ? React.createElement("div", { className: notice.kind === "error" ? "lmcp_error" : "lmcp_ok" }, notice.text) : null,
					React.createElement("div", { className: "lmcp_actions" },
						React.createElement("button", { className: "lmcp_btn", disabled: busy || draft.serverName.trim() === "", onClick: submit }, busy ? "处理中…" : "添加"))),

				state.patchFile ? React.createElement("div", { className: "lmcp_path" }, "配置文件：" + state.patchFile) : null);
		}

		/* `slots` is declared as a hard dependency on purpose. Reading it with
		 * ctx.get('slots') only tells us whether it happens to exist at this
		 * instant, and the client half is applied while the shell is still
		 * wiring its services -- so the optional read returned undefined and the
		 * section silently never registered. Declaring it makes Cordis wait for
		 * the service and then apply this half, which is what a client plugin
		 * registering a settings section needs. */
		function apply(ctx) {
			ctx.slots.inject("settings.section", function () {
				return ctx.slots.register({
					name: "settings.section",
					id: "mcp",
					order: 50,
					label: "MCP",
				}, McpSettings);
			});
		}

		exports.inject = ["slots"];
		exports.apply = apply;
		return module.exports;
	}
});
//# sourceMappingURL=client.js.map
