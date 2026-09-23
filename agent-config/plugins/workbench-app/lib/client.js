window.__ModuleLoader__.load({
	id: "dsh-workbench",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");
		var h = React.createElement;

		/* ==================================================================
		 * dsh-workbench — browser half.
		 *
		 * 装配台（原型的 Landing 页）：A1 给谁写 / A2 主题 / A3 工作区 /
		 * A4 拖杆 / A5 怎么写 / A6 底座 / A7 放大编辑。
		 *
		 * 两条硬规矩
		 * ----------
		 * 1. **没接的一律留空，不塞假数据。** 薄弱问句库、skill 列表现在都没接，
		 *    就渲染原型里那块表格/那排标签的**壳**加一句空态说明，不放编造的行。
		 *    假数据会让人误以为接了，然后照着假形状去写后端。
		 * 2. **只落在 DSH 的扩展点上。** 新的 `main` 面板 + `sidebar.panellist`
		 *    一行 + 一个会话域的接力挂件。root / conversation / composer /
		 *    sidebar.workspaces 一个都不碰，标准流程永远一点即达。
		 *
		 * 类名全是自己的 `wb_` 前缀：CSS 是手写的（本包没有 tsdown 构建，
		 * 没有 class-name hashing 可依赖），所以也绝不写指向别人 hash 类名的选择器。
		 *
		 * 令牌照搬 workbench/原型v2暂定版/styles.css:8-80。
		 * ================================================================== */

		var CSS = [
			/* ---- tokens (原型 styles.css:8-80) ------------------------------
			 * On `body`, not on our own root: this is the product palette, and
			 * the conversation skin needs it too. Dark hangs off the attribute
			 * DSH's own ThemePresenter writes, so it follows the user's
			 * light/dark choice instead of inventing a second switch. */
			"body{",
			"  --wb-bg:#ffffff; --wb-side:#f6f7f9; --wb-elev:#ffffff; --wb-elev2:#eef1f5;",
			"  --wb-line:#e2e5ea; --wb-line-soft:#edeff3;",
			"  --wb-text:#1d2129; --wb-strong:#000000; --wb-dim:#5b626e; --wb-dim2:#98a0ac;",
			"  --wb-accent:#3b6df6; --wb-accent-bg:#eef3ff; --wb-accent-line:#cfdcff;",
			"  --wb-accent-glow:rgba(59,109,246,.16);",
			"  --wb-ok:#12a06a; --wb-ok-bg:#e8f7f0; --wb-warn:#c98200; --wb-bad:#d64545; --wb-bad-bg:#fdeceb;",
			"  --wb-r:10px; --wb-content:940px;",
			"  --wb-shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06);",
			"  --wb-pop:0 8px 24px rgba(16,24,40,.14);",
			"  --wb-font:-apple-system,\"PingFang SC\",\"Hiragino Sans GB\",\"Microsoft YaHei\",sans-serif;",
			"  --wb-mono:ui-monospace,SFMono-Regular,Menlo,monospace;",
			"}",
			"body[data-ds-dark-theme]{",
			"  --wb-bg:#14161b; --wb-side:#171a20; --wb-elev:#1c2028; --wb-elev2:#232833;",
			"  --wb-line:#2b3140; --wb-line-soft:#232836;",
			"  --wb-text:#e7e9ef; --wb-strong:#ffffff; --wb-dim:#9aa2b4; --wb-dim2:#6b7385;",
			"  --wb-accent:#4d7cfe; --wb-accent-bg:#141d2e; --wb-accent-line:#26364f;",
			"  --wb-accent-glow:rgba(77,124,254,.15);",
			"  --wb-ok:#3ecf8e; --wb-ok-bg:#12241d; --wb-warn:#f0b429; --wb-bad:#ff7b7b; --wb-bad-bg:#3a1f1f;",
			"  --wb-shadow:none; --wb-pop:0 8px 24px rgba(0,0,0,.55);",
			"}",

			/* ---- C 区皮肤（会话页）------------------------------------------
			 * 只瞄 [data-slot="..."]：槽位名是公开契约，hash 类名每次上游重建都变。 */
			"[data-slot='main.conversation']{",
			"  --dsh-chat-content-width:var(--wb-content);",
			"  background:var(--wb-bg); color:var(--wb-text); font-family:var(--wb-font);",
			"}",
			"[data-slot='conversation.session.header']{",
			"  border-bottom:1px solid var(--wb-line-soft); background:var(--wb-bg);",
			"}",
			"[data-slot='conversation.composer.bar']{ --dsw-specific-input-major:var(--wb-elev); }",

			/* ---- 工作台自己的壳 ---------------------------------------------- */
			".wb_root{",
			"  box-sizing:border-box; display:flex; flex-direction:column; height:100%; min-height:0;",
			"  background:var(--wb-bg); color:var(--wb-text); font:14px/1.6 var(--wb-font);",
			"}",
			".wb_root *{box-sizing:border-box;}",
			".wb_root button{font:inherit; cursor:pointer; color:inherit;}",
			".wb_root textarea{font:inherit; color:inherit;}",
			".wb_root select{font:inherit; color:inherit;}",
			".wb_asm{",
			"  flex:1; min-height:0; display:flex; flex-direction:column; gap:10px;",
			"  width:100%; max-width:976px; margin:0 auto; padding:16px 18px 14px;",
			"}",

			/* A1 给谁写 */
			".wb_head{",
			"  flex:0 0 auto; display:flex; align-items:center; gap:6px;",
			"  padding:10px 12px; border:1px solid var(--wb-line); border-radius:var(--wb-r);",
			"  background:var(--wb-elev); box-shadow:var(--wb-shadow);",
			"}",
			".wb_headT{color:var(--wb-dim); font-size:13px; flex:0 0 auto;}",
			".wb_sel{position:relative; display:inline-flex; align-items:center; min-width:0;}",
			".wb_sel select{",
			"  appearance:none; -webkit-appearance:none; cursor:pointer; max-width:15em;",
			"  padding:4px 24px 4px 10px; border:1px solid transparent; border-radius:8px;",
			"  background:var(--wb-elev2); font-size:15px; font-weight:600; text-overflow:ellipsis;",
			"}",
			".wb_sel select:hover{border-color:var(--wb-accent-line);}",
			".wb_sel select:focus-visible{outline:2px solid var(--wb-accent); outline-offset:1px;}",
			".wb_sel select:disabled{color:var(--wb-dim2); cursor:default; font-weight:400;}",
			/* 三级递进：客户 → 产品线 → 期数。字号字重一层层降下来，
			 * 分隔符是 ›，不是 ·（· 读起来像并列清单，这是之前的错）。 */
			".wb_lv1 select{font-size:15px; font-weight:600; background:var(--wb-elev2);}",
			".wb_lv2 select{font-size:14px; font-weight:500; background:transparent; color:var(--wb-text);}",
			".wb_lv3 select{font-size:13px; font-weight:400; background:transparent; color:var(--wb-dim);}",
			".wb_lv2 select:hover, .wb_lv3 select:hover{background:var(--wb-elev2);}",
			".wb_sel::after{content:'▾'; position:absolute; right:8px; color:var(--wb-dim2); font-size:11px; pointer-events:none;}",
			".wb_dot{color:var(--wb-dim2);}",
			".wb_hint{margin-left:auto; font-size:10.5px; color:var(--wb-dim2); white-space:nowrap;}",
			".wb_mini{",
			"  flex:0 0 auto; padding:4px 9px; border:1px solid var(--wb-line); border-radius:7px;",
			"  background:var(--wb-elev); color:var(--wb-dim); font-size:12px;",
			"}",
			".wb_mini:hover:not(:disabled){border-color:var(--wb-accent-line); color:var(--wb-accent);}",
			".wb_mini:disabled{opacity:.45; cursor:default;}",
			".wb_miniSoft{border-color:var(--wb-accent-line); background:var(--wb-accent-bg); color:var(--wb-accent);}",

			/* A2 主题 */
			".wb_row{flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:0 2px;}",
			".wb_cap{font-size:12.5px; color:var(--wb-dim); flex:0 0 auto;}",
			".wb_tabs{display:inline-flex; gap:2px; padding:2px; border-radius:9px; background:var(--wb-elev2);}",
			".wb_tab{",
			"  padding:4px 14px; border:1px solid transparent; border-radius:7px;",
			"  background:transparent; color:var(--wb-dim); font-size:13px;",
			"}",
			".wb_tab[data-on='1']{background:var(--wb-accent-bg); border-color:var(--wb-accent-line); color:var(--wb-accent); font-weight:600;}",

			/* A3 工作区 */
			".wb_work{",
			"  flex:1 1 0; min-height:120px; display:flex; flex-direction:column;",
			"  border:1px solid var(--wb-line); border-radius:var(--wb-r); background:var(--wb-elev);",
			"  box-shadow:var(--wb-shadow); overflow:hidden;",
			"}",
			".wb_workBar{",
			"  flex:0 0 auto; display:flex; align-items:center; gap:8px; padding:8px 10px;",
			"  border-bottom:1px solid var(--wb-line-soft); background:var(--wb-side);",
			"}",
			".wb_meta{font-size:11.5px; color:var(--wb-dim2);}",
			".wb_workBody{flex:1; min-height:0; overflow:auto; padding:0;}",
			".wb_free{",
			"  width:100%; height:100%; min-height:0; padding:14px; resize:none;",
			"  border:none; outline:none; background:transparent; font:14px/1.7 var(--wb-font);",
			"}",

			/* A3 表格（结构照原型，行留空 —— 数据没接就不放行） */
			".wb_tbl{width:100%; border-collapse:collapse; table-layout:fixed;}",
			".wb_tbl th{",
			"  position:sticky; top:0; z-index:1; text-align:left; font-size:11px; font-weight:500;",
			"  color:var(--wb-dim); background:var(--wb-side); padding:8px 14px;",
			"  border-bottom:1px solid var(--wb-line);",
			"}",
			".wb_tbl th:first-child{width:38px;}",
			".wb_tbl td{padding:9px 14px; border-bottom:1px solid var(--wb-line-soft); font-size:13px;}",

			/* A4 拖杆 */
			".wb_split{",
			"  flex:0 0 auto; height:8px; margin:-5px 0; display:flex; align-items:center;",
			"  justify-content:center; cursor:row-resize; position:relative;",
			"}",
			".wb_split::before{content:''; width:46px; height:3px; border-radius:2px; background:var(--wb-line);}",
			".wb_split:hover::before, .wb_split[data-drag='1']::before{background:var(--wb-accent-line);}",
			"body[data-wb-drag]{cursor:row-resize; user-select:none;}",

			/* A5 怎么写 */
			".wb_ref{",
			"  flex:0 1 auto; min-height:0; display:flex; flex-direction:column;",
			"  border:1px solid var(--wb-line); border-radius:var(--wb-r); background:var(--wb-elev);",
			"  box-shadow:var(--wb-shadow); overflow:hidden;",
			"}",
			".wb_ref[data-open='1']{flex:1 1 0;}",
			".wb_refHd{",
			"  flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:8px 12px; cursor:pointer;",
			"}",
			".wb_chev{color:var(--wb-dim2); font-size:11px; width:10px;}",
			".wb_refTabs{display:inline-flex; gap:2px;}",
			".wb_refTab{",
			"  padding:3px 12px; border:1px solid transparent; border-radius:7px;",
			"  background:transparent; color:var(--wb-dim); font-size:12.5px;",
			"}",
			".wb_refTab[data-on='1']{background:var(--wb-accent-bg); border-color:var(--wb-accent-line); color:var(--wb-accent);}",
			".wb_refSum{margin-left:auto; font-size:11.5px; color:var(--wb-dim2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}",
			".wb_refBd{flex:1; min-height:0; overflow:auto; padding:0 12px 12px; display:flex; flex-direction:column; gap:10px;}",
			".wb_refBox{",
			"  position:relative; display:flex; flex-direction:column; gap:6px; padding:8px 10px;",
			"  border:1px solid var(--wb-line); border-radius:9px; background:var(--wb-bg);",
			"}",
			".wb_refBox textarea{",
			"  width:100%; min-height:64px; max-height:180px; resize:none;",
			"  border:none; outline:none; background:transparent; font:13px/1.7 var(--wb-font);",
			"}",
			".wb_ribBar{display:flex; align-items:center; gap:8px;}",
			".wb_seg{display:inline-flex; gap:2px; padding:2px; border-radius:9px; background:var(--wb-elev2);}",
			".wb_segB{padding:3px 14px; border:1px solid transparent; border-radius:7px; background:transparent; color:var(--wb-dim); font-size:12.5px;}",
			".wb_segB[data-on='1']{background:var(--wb-accent-bg); border-color:var(--wb-accent-line); color:var(--wb-accent); font-weight:600;}",
			".wb_refList{display:flex; flex-direction:column; gap:4px;}",
			".wb_refItem{display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:7px; background:var(--wb-elev2); font-size:12px;}",
			".wb_refK{color:var(--wb-dim2);}",
			".wb_refV{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--wb-mono); font-size:11px;}",
			".wb_refX{border:none; background:transparent; color:var(--wb-dim2); padding:0 4px; font-size:14px; line-height:1;}",
			".wb_refX:hover{color:var(--wb-bad);}",

			/* A5 用模板（skill 没接 → 只有分组和空态） */
			".wb_skGroup{display:flex; flex-direction:column; gap:6px;}",
			".wb_skCap{font-size:11px; color:var(--wb-dim2);}",
			".wb_skEmpty{",
			"  padding:10px 12px; border:1px dashed var(--wb-line); border-radius:9px;",
			"  font-size:12px; color:var(--wb-dim2); text-align:center;",
			"}",
			".wb_chipBtn{",
			"  padding:4px 11px; border:1px solid var(--wb-line); border-radius:999px;",
			"  background:var(--wb-elev); color:var(--wb-dim); font-size:12.5px;",
			"}",
			".wb_chipBtn:hover{border-color:var(--wb-accent-line); color:var(--wb-accent);}",
			".wb_chipBtn[data-on='1']{background:var(--wb-accent-bg); border-color:var(--wb-accent-line); color:var(--wb-accent); font-weight:600;}",

			/* A6 底座 + A7 放大 */
			".wb_base{flex:0 0 auto; position:relative; display:flex; flex-direction:column; gap:6px;}",
			".wb_box{",
			"  position:relative; display:flex; flex-direction:column; gap:6px; padding:8px 10px;",
			"  border:1px solid var(--wb-line); border-radius:var(--wb-r); background:var(--wb-elev);",
			"  box-shadow:var(--wb-shadow);",
			"}",
			".wb_base[data-zoom='1'] .wb_box{",
			"  position:absolute; left:0; right:0; bottom:0; z-index:30; box-shadow:var(--wb-pop);",
			"}",
			".wb_input{",
			"  width:100%; min-height:26px; max-height:168px; resize:none; overflow-y:auto;",
			"  border:none; outline:none; background:transparent; font:14px/1.6 var(--wb-font);",
			"  padding:2px 78px 2px 0;",
			"}",
			".wb_base[data-zoom='1'] .wb_input{min-height:240px; max-height:520px;}",
			".wb_zoom{",
			"  position:absolute; top:6px; right:8px; display:inline-flex; align-items:center; gap:4px;",
			"  padding:2px 7px; border:1px solid var(--wb-line); border-radius:7px;",
			"  background:var(--wb-elev); color:var(--wb-dim2); font-size:11px;",
			"}",
			".wb_zoom:hover{border-color:var(--wb-accent-line); color:var(--wb-accent);}",
			".wb_actions{display:flex; align-items:center; gap:8px;}",
			".wb_chip{",
			"  display:inline-flex; align-items:center; gap:6px; min-width:0; max-width:44em;",
			"  padding:2px 7px; border:1px solid var(--wb-accent-line); border-radius:6px;",
			"  background:var(--wb-accent-bg); color:var(--wb-accent); font-size:11.5px;",
			"  overflow:hidden; white-space:nowrap;",
			"}",
			".wb_chipX{border:none; background:transparent; color:inherit; padding:0; font-size:13px; line-height:1;}",
			".wb_send{",
			"  margin-left:auto; flex:0 0 auto; padding:6px 18px; border:1px solid transparent; border-radius:7px;",
			"  background:var(--wb-accent); color:#fff !important; font-size:13px; font-weight:600;",
			"}",
			".wb_send:disabled{opacity:.45; cursor:default;}",

			/* 空态 */
			".wb_empty{",
			"  height:100%; min-height:110px; display:flex; flex-direction:column;",
			"  align-items:center; justify-content:center; gap:6px; text-align:center; padding:18px;",
			"}",
			".wb_emptyT{font-size:13px;}",
			".wb_emptyS{font-size:11.5px; color:var(--wb-dim2); line-height:1.7; max-width:46em;}",
			".wb_bad{color:var(--wb-bad);}",
		].join("\n");

		/* The official client-package CSS pattern: one tag, keyed by
		 * data-plugin-css, injected from apply() — HMR removes
		 * <style data-plugin=...> tags on a reload, so a top-level injection
		 * would simply vanish. */
		var TAG_ID = "dsh-workbench/workbench.css";

		function injectStyles() {
			if (typeof document === "undefined") return null;
			var existing = document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]");
			if (existing !== null) return existing;
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-workbench";
			tag.dataset.pluginCss = TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return tag;
		}

		var WORKBENCH_KEY = "workbench";

		/* ---- 侧栏那一行的图标 -------------------------------------------- */
		function WorkbenchIcon(props) {
			var size = Number(props && props.size) || 16;
			return h("svg", {
				width: size, height: size, viewBox: "0 0 16 16", fill: "none",
				"aria-hidden": "true", focusable: "false",
			},
				h("rect", { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2, stroke: "currentColor", strokeWidth: 1.2 }),
				h("path", { d: "M1.5 6h13", stroke: "currentColor", strokeWidth: 1.2 }),
				h("path", { d: "M5.5 6v7.5", stroke: "currentColor", strokeWidth: 1.2 }));
		}

		/* ==================================================================
		 * 客户 = 知识库。打开查一次，本次会话内复用；权限在服务端过滤，
		 * 前端不判权限、也拿不到别人客户的名单。
		 * ================================================================== */
		var CLIENTS_PATH = "/api/workbench/clients";

		function useClients() {
			var state = React.useState({ status: "loading", customers: [], error: "", detail: "", uid: "" });
			var setValue = state[1];
			React.useEffect(function () {
				var alive = true;
				fetch(CLIENTS_PATH, { headers: { accept: "application/json" } })
					.then(readJson)
					.then(function (body) {
						if (!alive) return;
						if (body && body.ok === true) {
							setValue({ status: "ready", customers: body.customers || [], error: "", detail: "", uid: body.uid || "" });
						} else {
							setValue({
								status: "error", customers: [],
								error: (body && body.error) || "unknown",
								detail: (body && body.detail) || "",
								uid: (body && body.uid) || "",
							});
						}
					})
					.catch(function (error) {
						if (!alive) return;
						setValue({ status: "error", customers: [], error: "unreachable", detail: String(error && error.message ? error.message : error), uid: "" });
					});
				return function () { alive = false; };
			}, []);
			return state[0];
		}

		/* 宿主路由没挂上时（宿主代码改了要重启 DSH 才生效），fetch 回来的是
		 * 纯文本 "unauthorized"/"not found"，`r.json()` 会抛 "Unexpected token"。
		 * 那种话对用户毫无意义 —— 这里统一成一句能指方向的说明。 */
		function readJson(response) {
			if (!response.ok) {
				return { ok: false, error: "route-missing", detail: "HTTP " + response.status };
			}
			return response.json().catch(function () {
				return { ok: false, error: "route-missing", detail: "HTTP " + response.status + " · 不是 JSON" };
			});
		}

		/* 技能目录：dsh-skill-remote 注册的 provider，宿主用 ctx.skills.list() 读。 */
		function useSkills() {
			var state = React.useState({ status: "loading", skills: [], error: "", detail: "" });
			var setValue = state[1];
			React.useEffect(function () {
				var alive = true;
				fetch("/api/workbench/skills", { headers: { accept: "application/json" } })
					.then(readJson)
					.then(function (body) {
						if (!alive) return;
						if (body && body.ok === true) setValue({ status: "ready", skills: body.skills || [], error: "", detail: "" });
						else setValue({ status: "error", skills: [], error: (body && body.error) || "unknown", detail: (body && body.detail) || "" });
					})
					.catch(function (e) {
						if (alive) setValue({ status: "error", skills: [], error: "unreachable", detail: String(e && e.message ? e.message : e) });
					});
				return function () { alive = false; };
			}, []);
			return state[0];
		}

		/* 文章库：看这个客户在文章库里已经有多少篇。client 为空就不查。 */
		function useArticles(client) {
			var state = React.useState({ status: "idle", articles: [], error: "", detail: "" });
			var setValue = state[1];
			React.useEffect(function () {
				if (client === "") { setValue({ status: "idle", articles: [], error: "", detail: "" }); return undefined; }
				var alive = true;
				setValue({ status: "loading", articles: [], error: "", detail: "" });
				fetch("/api/workbench/articles?client=" + encodeURIComponent(client), { headers: { accept: "application/json" } })
					.then(readJson)
					.then(function (body) {
						if (!alive) return;
						if (body && body.ok === true) setValue({ status: "ready", articles: body.articles || [], error: "", detail: "" });
						else setValue({ status: "error", articles: [], error: (body && body.error) || "unknown", detail: (body && body.detail) || "" });
					})
					.catch(function (e) {
						if (alive) setValue({ status: "error", articles: [], error: "unreachable", detail: String(e && e.message ? e.message : e) });
					});
				return function () { alive = false; };
			}, [client]);
			return state[0];
		}

		function clientsErrorText(error, detail) {
			if (error === "mcp-missing") return detail || "没找到知识库 MCP 的客户列表工具。";
			if (error === "mcp-error") return "知识库 MCP 报错：" + detail;
			if (error === "bad-reply") return "知识库 MCP 回来了，但形状不认识：" + detail;
			if (error === "unreachable") return "连不上宿主路由：" + detail;
			if (error === "route-missing") {
				return "宿主路由还没挂上（" + detail + "）—— 宿主代码改了要重启一次 DSH 才生效。";
			}
			return "读客户列表失败：" + (detail || error);
		}

		function skillsErrorText(error, detail) {
			if (error === "route-missing") return "技能服务的宿主路由还没挂上 —— 宿主代码改了要重启一次 DSH 才生效。";
			if (error === "skills-unavailable") return "技能目录读不到：" + detail;
			if (error === "unreachable") return "连不上宿主路由：" + detail;
			return "读技能目录失败：" + (detail || error);
		}

		/* 宿主那半边负责归一化，但线上可能同时跑着两个版本的宿主代码
		 * （改宿主代码要重启才生效，客户端却立刻热重载）。所以这里对两种形状
		 * 都容错：归一化后的 {id,name,meta} 和原始的生产形状 {client_key,
		 * display_name,files,chars} 都能读。 */
		function customerId(c) { return String(c.id || c.client_key || c.name || ""); }
		function customerName(c) { return String(c.name || c.display_name || c.client_key || c.id || ""); }
		function customerMeta(c) {
			if (typeof c.meta === "string" && c.meta !== "") return c.meta;
			var bits = [];
			if (typeof c.files === "number") bits.push(c.files + " 个文件");
			if (typeof c.chars === "number") bits.push(Math.round(c.chars / 1000) + "k 字");
			return bits.join(" · ");
		}

		function Empty(props) {
			return h("div", { className: "wb_empty" },
				h("div", { className: "wb_emptyT" + (props.bad ? " wb_bad" : "") }, props.title),
				props.sub ? h("div", { className: "wb_emptyS" }, props.sub) : null);
		}

		/* 会话域接力：装配台（root 域）拿不到 inputActions，发不了消息。
		 * 这里挂在会话的 composer dock 上，把装配台留下的提示词塞进草稿并提交。
		 * 一次性：取走即清，避免重开渲染时重复发送。
		 *
		 * P0 修复（串台）：以前这里的 effect 只看 actions，凡挂着一个 dock
		 * 就消费 —— 于是提示词落进了「当时打开的那条会话」。现在加两条守卫：
		 *   1. 只在**空白会话**里消费：startSession() 会复用/新建空白会话，
		 *      目标会话必然没有消息节点；非空白的一律跳过，留给目标。
		 *      （旧会话若本身就是空白，它就是 startSession 复用的目标，消费正确。）
		 *   2. dispatch() 派发 `wb-prompt-set` 事件：当前打开的会话如果恰好
		 *      是空白目标（actions/isEmpty 都没变，effect 不会重跑），靠事件
		 *      触发一次检查，提示词不会卡住。 */
		var pendingPrompt = null;

		function PromptRelay(props) {
			var actions = props.inputActions;
			var useChat = props.useChat;

			/* 当前会话的消息节点数：0 = 空白。selector 返回数字，
			 * snapshot 相等性比较才稳定，不会引发多余的 effect。 */
			var nodeCount = 0;
			if (typeof useChat === "function") {
				nodeCount = useChat(function (snapshot) {
					var nodes = snapshot && snapshot.legacy && snapshot.legacy.nodes;
					if (Array.isArray(nodes)) return nodes.length;
					if (nodes !== null && typeof nodes === "object") return Object.keys(nodes).length;
					return 0;
				});
				if (typeof nodeCount !== "number" || isNaN(nodeCount)) nodeCount = 1; // 认不出就当非空白，宁可不发不串台
			} else {
				nodeCount = -1; // 拿不到 useChat —— 退回旧行为（没有判断依据）
			}
			var isEmpty = nodeCount === 0 || nodeCount === -1;

			var consumeRef = React.useRef(null);
			consumeRef.current = function () {
				if (pendingPrompt === null) return;
				if (actions === undefined || actions === null) {
					/* 真有提示词要发却拿不到 inputActions —— 说出来，别静默吞掉。 */
					console.warn("[dsh-workbench] 接力挂件拿不到 inputActions，提示词没发出去");
					return;
				}
				if (!isEmpty) {
					/* 非空白会话：不是目标，跳过 —— 提示词留给空白目标会话。 */
					return;
				}
				var text = pendingPrompt;
				pendingPrompt = null;
				actions.setDraft(text);
				actions.submit();
			};

			React.useEffect(function () {
				consumeRef.current();
			}, [actions, isEmpty]);

			/* dispatch() 设好 pendingPrompt 后派发的事件：让"当前已挂着的
			 * 空白会话"（deps 都没变的那种）也能立刻消费，不等下一次渲染。 */
			React.useEffect(function () {
				var onSet = function () { consumeRef.current(); };
				window.addEventListener("wb-prompt-set", onSet);
				return function () { window.removeEventListener("wb-prompt-set", onSet); };
			}, []);
			return null;
		}

		/* ==================================================================
		 * 装配台
		 * ================================================================== */
		var REF_STYLES = ["一比一", "模仿结构", "其他"];
		var URL_RE = /^(https?:\/\/|www\.)\S+$/i;

		function splitRefs(text) {
			var urls = [];
			var body = [];
			var lines = String(text || "").split("\n");
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i].trim();
				if (line === "") continue;
				if (URL_RE.test(line)) urls.push(line); else body.push(line);
			}
			return { urls: urls, body: body.join("\n") };
		}

		/* 期数属于业务线，不是跟它并列的第三个东西。
		 *
		 * 但库里的数据是混的：`business_line_id` 有值的是挂在这条线下的，
		 * 为 null 的是"没指定线"的（客户级）。严格按线过滤会把没指定线的
		 * 那些全藏起来，所以这里：挂了线的按线过滤，没指定线的照留。 */
		function periodsFor(customer, lineId) {
			var all = (customer && customer.service_periods) || [];
			return all.filter(function (period) {
				var bound = period.business_line_id === null || period.business_line_id === undefined
					? ""
					: String(period.business_line_id);
				if (bound === "") return true;          // 没指定线 —— 客户级，哪条线都看得见
				return bound === String(lineId || "");   // 挂了线 —— 只在那条线下出现
			});
		}

		function firstPeriodId(customer, lineId) {
			var list = periodsFor(customer, lineId);
			return list.length === 0 ? "" : String(list[0].id || "");
		}

		function WorkbenchPage(props) {
			var ctx = props.ctx;
			var clients = useClients();

			var modeS = React.useState("weak");
			var mode = modeS[0], setMode = modeS[1];
			var pickS = React.useState({ key: "", line: "", period: "" });
			var pick = pickS[0], setPick = pickS[1];
			var topicS = React.useState("");
			var topic = topicS[0], setTopic = topicS[1];
			var baseS = React.useState("");
			var base = baseS[0], setBase = baseS[1];
			var chipOffS = React.useState(false);
			var chipOff = chipOffS[0], setChipOff = chipOffS[1];

			var refOpenS = React.useState(true);
			var refOpen = refOpenS[0], setRefOpen = refOpenS[1];
			var refTabS = React.useState("copy");
			var refTab = refTabS[0], setRefTab = refTabS[1];
			var refTextS = React.useState("");
			var refText = refTextS[0], setRefText = refTextS[1];
			var refStyleS = React.useState(REF_STYLES[0]);
			var refStyle = refStyleS[0], setRefStyle = refStyleS[1];
			var pickedS = React.useState([]);
			var picked = pickedS[0], setPicked = pickedS[1];

			var zoomS = React.useState(false);
			var zoom = zoomS[0], setZoom = zoomS[1];
			var heightS = React.useState(null);
			var workHeight = heightS[0], setWorkHeight = heightS[1];
			var sendingS = React.useState("");
			var sending = sendingS[0], setSending = sendingS[1];

			/* 默认选第一个客户 */
			React.useEffect(function () {
				if (clients.status !== "ready" || clients.customers.length === 0) return;
				var first = clients.customers[0];
				var line = (first.business_lines && first.business_lines[0]) || null;
				setPick({
					key: customerId(first),
					line: line === null ? "" : String(line.id || ""),
					period: firstPeriodId(first, line === null ? "" : String(line.id || "")),
				});
			}, [clients.status, clients.customers]);

			var current = null;
			for (var i = 0; i < clients.customers.length; i++) {
				if (customerId(clients.customers[i]) === pick.key) { current = clients.customers[i]; break; }
			}
			var lines = (current && current.business_lines) || [];
			var periods = periodsFor(current, pick.line);
			var clientName = current ? customerName(current) : "";
			var clientMeta = current ? customerMeta(current) : "";
			var skills = useSkills();
			var articles = useArticles(clientName);
			var lineName = "";
			for (var li = 0; li < lines.length; li++) if (String(lines[li].id) === pick.line) lineName = String(lines[li].name || "");
			var periodName = "";
			for (var pi = 0; pi < periods.length; pi++) if (String(periods[pi].id) === pick.period) periodName = String(periods[pi].name || "");

			var refs = splitRefs(refText);
			var refCount = refs.urls.length + (refs.body.trim() === "" ? 0 : 1);
			var baseRef = React.useRef(null);
			React.useEffect(function () {
				var node = baseRef.current;
				if (node === null) return;
				node.style.height = "auto";
				var max = zoom ? 520 : 168;
				var min = zoom ? 240 : 26;
				node.style.height = Math.min(max, Math.max(min, node.scrollHeight)) + "px";
				node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
			}, [base, zoom]);

			function onClient(event) {
				var key = event.target.value;
				var found = null;
				for (var j = 0; j < clients.customers.length; j++) {
					if (customerId(clients.customers[j]) === key) { found = clients.customers[j]; break; }
				}
				var line = (found && found.business_lines && found.business_lines[0]) || null;
				var lineId = line === null ? "" : String(line.id || "");
				setPick({ key: key, line: lineId, period: firstPeriodId(found, lineId) });
				setChipOff(false);
			}

			/* 换产品线 → 期数跟着重选（期数是线下面的东西，不是并列的） */
			function onLine(event) {
				var lineId = event.target.value;
				setPick({ key: pick.key, line: lineId, period: firstPeriodId(current, lineId) });
				setChipOff(false);
			}

			/* 拼提示词：只写用户真的选了的，没选的不编。 */
			function composePrompt() {
				var parts = [];
				var who = "给 " + (clientName || "（没选客户）");
				if (lineName !== "") who += " › " + lineName;
				if (periodName !== "") who += " › " + periodName;
				parts.push(who + " 写。");
				if (mode === "free" && topic.trim() !== "") parts.push("主题：" + topic.trim());
				if (mode === "weak") parts.push("主题：薄弱问句库（还没接，未选）。");
				var how = [];
				if (refCount > 0) {
					var bits = [];
					if (refs.urls.length > 0) bits.push(refs.urls.length + " 个链接");
					if (refs.body.trim() !== "") bits.push("正文 " + refs.body.replace(/\s/g, "").length + " 字");
					how.push("仿写：" + bits.join(" + ") + " · " + refStyle);
				}
				if (picked.length > 0) how.push("技能：" + picked.join("、"));
				if (how.length > 0) parts.push("怎么写：" + how.join("｜"));
				if (base.trim() !== "") parts.push("补充要求：" + base.trim());
				return parts.join("\n");
			}

			function dispatch() {
				if (clientName === "") return;
				var text = composePrompt();
				var workspace = ctx !== undefined && ctx !== null && typeof ctx.get === "function" ? ctx.get("uiWorkspace") : undefined;
				if (workspace === undefined || workspace === null || typeof workspace.startSession !== "function") {
					setSending("起不了会话：宿主没有 uiWorkspace");
					return;
				}
				pendingPrompt = text;
				setSending("");
				try {
					workspace.startSession();
				} catch (error) {
					pendingPrompt = null;
					setSending("起会话失败：" + String(error && error.message ? error.message : error));
					return;
				}
				/* 通知接力挂件：万一当前挂着的会话就是空白目标
				 * （effect 的 deps 都没变），靠这个事件立刻消费。 */
				try { window.dispatchEvent(new Event("wb-prompt-set")); } catch (error) { /* 老浏览器就算了 */ }
			}

			/* A4：拖杆改工作区高度。指针捕获，鼠标移出窗口也不会卡住。 */
			function startDrag(event) {
				event.preventDefault();
				var startY = event.clientY;
				var host = document.getElementById("wb-work");
				var startH = host === null ? 200 : host.getBoundingClientRect().height;
				var target = event.currentTarget;
				target.setPointerCapture(event.pointerId);
				target.dataset.drag = "1";
				document.body.setAttribute("data-wb-drag", "1");
				var move = function (moveEvent) {
					var next = Math.max(120, startH + (moveEvent.clientY - startY));
					setWorkHeight(next);
				};
				var up = function () {
					target.removeEventListener("pointermove", move);
					target.removeEventListener("pointerup", up);
					target.removeEventListener("pointercancel", up);
					target.dataset.drag = "0";
					document.body.removeAttribute("data-wb-drag");
				};
				target.addEventListener("pointermove", move);
				target.addEventListener("pointerup", up);
				target.addEventListener("pointercancel", up);
			}

			var headHint = clients.status === "loading"
				? "知识库：查询中…"
				: clients.status === "error"
					? "知识库：读不到客户"
					: "知识库：" + clients.customers.length + " 个客户"
						+ (articles.status === "ready" ? " · 文章库 " + articles.articles.length + " 篇" : "")
						+ (articles.status === "error" ? " · 文章库读不到" : "");

			var chip = "给 " + (clientName || "（没选客户）")
				+ (lineName === "" ? "" : " · " + lineName)
				+ (periodName === "" ? "" : " · " + periodName)
				+ (mode === "free" && topic.trim() !== "" ? " 写「" + topic.trim().slice(0, 24) + "」" : " 写")
				+ (refCount === 0 ? "" : "，照着 " + refCount + " 篇仿写");

			var refSummary = refCount === 0 ? "" : refCount + " 篇参考 · " + refStyle;

			return h("div", { className: "wb_root" },
				h("div", { className: "wb_asm" },

					/* ---- A1 给谁写 ---- */
					h("div", { className: "wb_head" },
						h("span", { className: "wb_headT" }, "给"),
						h("span", { className: "wb_sel wb_lv1" },
							h("select", {
								value: pick.key, onChange: onClient, "aria-label": "客户",
								disabled: clients.status !== "ready" || clients.customers.length === 0,
							},
								clients.status === "ready" && clients.customers.length === 0
									? h("option", { value: "" }, "（没有可见客户）")
									: clients.customers.map(function (customer) {
										var key = customerId(customer);
										return h("option", { key: key, value: key }, customerName(customer));
									}))),
						clientMeta === "" ? null : h("span", { className: "wb_meta" }, clientMeta),
						h("span", { className: "wb_dot" }, "›"),
						h("span", { className: "wb_sel wb_lv2" },
							h("select", {
								value: pick.line, "aria-label": "产品线", disabled: lines.length === 0,
								onChange: onLine,
							},
								lines.length === 0
									? h("option", { value: "" }, "（无产品线）")
									: lines.map(function (line) {
										var id = String(line.id || "");
										return h("option", { key: id, value: id }, String(line.name || id));
									}))),
						h("span", { className: "wb_dot" }, "›"),
						h("span", { className: "wb_sel wb_lv3" },
							h("select", {
								value: pick.period, "aria-label": "期数", disabled: periods.length === 0,
								onChange: function (e) { setPick({ key: pick.key, line: pick.line, period: e.target.value }); setChipOff(false); },
							},
								periods.length === 0
									? h("option", { value: "" }, "（无期数）")
									: periods.map(function (period) {
										var id = String(period.id || "");
										return h("option", { key: id, value: id }, String(period.name || id));
									}))),
						h("span", { className: "wb_headT" }, "写"),
						h("button", {
							className: "wb_mini", disabled: true,
							title: "新建客户 = 去知识库那边建一个；这一版还没接",
						}, "＋ 新建客户"),
						h("span", { className: "wb_hint" }, headHint)),

					/* ---- A2 主题 ---- */
					h("div", { className: "wb_row" },
						h("span", { className: "wb_cap" }, "主题"),
						h("span", { className: "wb_tabs" },
							h("button", { type: "button", className: "wb_tab", "data-on": mode === "weak" ? "1" : "0", onClick: function () { setMode("weak"); setChipOff(false); } }, "薄弱问句"),
							h("button", { type: "button", className: "wb_tab", "data-on": mode === "free" ? "1" : "0", onClick: function () { setMode("free"); setChipOff(false); } }, "输入"))),

					/* ---- A3 工作区 ---- */
					h("div", { className: "wb_work", id: "wb-work", style: workHeight === null ? undefined : { flex: "0 0 " + workHeight + "px" } },
						h("div", { className: "wb_workBar" },
							h("span", { className: "wb_meta" }, mode === "weak" ? "薄弱问句库 · 还没接" : "直接输入选题"),
							h("span", { className: "wb_hint" }, mode === "weak" ? "数据源未定，先留空" : "")),
						h("div", { className: "wb_workBody" },
							clients.status === "error"
								? h(Empty, { bad: true, title: "客户列表读不到，装配台就选不了客户", sub: clientsErrorText(clients.error, clients.detail) })
								: mode === "weak"
									? h("div", null,
										h("table", { className: "wb_tbl" },
											h("thead", null, h("tr", null,
												h("th", null, ""),
												h("th", null, "问句"),
												h("th", null, "差额（竞品第一 − 客户）"),
												h("th", null, "缺口平台"))),
											h("tbody", null, h("tr", null,
												h("td", { colSpan: 4 },
													h(Empty, {
														title: "薄弱问句库还没接",
														sub: "这里就是原型 A3 那张表（问句 / 差额 / 缺口平台 / 按住拖选）。数据源没定，一个字都不编。",
													}))))))
									: h("textarea", {
										className: "wb_free",
										placeholder: "想写什么选题，直接打。",
										value: topic,
										onChange: function (e) { setTopic(e.target.value); setChipOff(false); },
									}))),

					/* ---- A4 拖杆 ---- */
					h("div", {
						id: "wb-split", className: "wb_split", title: "拖动调整高度",
						onPointerDown: startDrag, role: "separator", "aria-orientation": "horizontal",
					}),

					/* ---- A5 怎么写 ---- */
					h("div", { className: "wb_ref", "data-open": refOpen ? "1" : "0" },
						h("div", {
							className: "wb_refHd",
							onClick: function () { setRefOpen(!refOpen); },
						},
							h("span", { className: "wb_cap" }, "怎么写"),
							h("span", { className: "wb_chev" }, refOpen ? "▾" : "▸"),
							h("span", { className: "wb_refTabs" },
								h("button", {
									type: "button", className: "wb_refTab", "data-on": refTab === "copy" ? "1" : "0",
									onClick: function (e) { e.stopPropagation(); setRefTab("copy"); setRefOpen(true); },
								}, "仿写" + (refCount === 0 ? "" : " " + refCount)),
								h("button", {
									type: "button", className: "wb_refTab", "data-on": refTab === "skill" ? "1" : "0",
									onClick: function (e) { e.stopPropagation(); setRefTab("skill"); setRefOpen(true); },
								}, "用模板" + (picked.length === 0 ? "" : " " + picked.length))),
							h("span", { className: "wb_refSum" }, refSummary)),
						refOpen ? h("div", { className: "wb_refBd" },
							refTab === "copy"
								? h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
									h("div", { className: "wb_refBox" },
										h("textarea", {
											placeholder: "一行一个链接，或者直接把整篇正文粘进来…",
											value: refText,
											onChange: function (e) { setRefText(e.target.value); },
										}),
										h("div", { className: "wb_ribBar" },
											h("button", { className: "wb_mini", disabled: true, title: "附件还没接" }, "选文件"))),
									refs.urls.length > 0 || refs.body.trim() !== ""
										? h("div", { className: "wb_refList" },
											refs.urls.map(function (url, index) {
												return h("div", { className: "wb_refItem", key: "u" + index },
													h("span", { className: "wb_refK" }, "链接"),
													h("span", { className: "wb_refV" }, url),
													h("button", {
														type: "button", className: "wb_refX", title: "去掉",
														onClick: function () {
															var next = refs.urls.filter(function (_, i) { return i !== index; });
															setRefText(next.concat(refs.body === "" ? [] : [refs.body]).join("\n"));
														},
													}, "×"));
											}),
											refs.body.trim() === "" ? null : h("div", { className: "wb_refItem" },
												h("span", { className: "wb_refK" }, "正文"),
												h("span", { className: "wb_refV" }, refs.body.replace(/\s/g, "").length + " 字"),
												h("button", {
													type: "button", className: "wb_refX", title: "去掉",
													onClick: function () { setRefText(refs.urls.join("\n")); },
												}, "×")))
										: null,
									h("span", { className: "wb_seg" },
										REF_STYLES.map(function (style) {
											return h("button", {
												type: "button", key: style, className: "wb_segB", "data-on": refStyle === style ? "1" : "0",
												onClick: function () { setRefStyle(style); },
											}, style);
										})))
								: h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
									skills.status === "error"
										? h("div", { className: "wb_skEmpty" }, skillsErrorText(skills.error, skills.detail))
										: skills.status === "loading"
											? h("div", { className: "wb_skEmpty" }, "技能目录读取中…")
											: skills.skills.length === 0
												? h("div", { className: "wb_skEmpty" }, "技能服务是空的 —— 一个 skill 都没注册")
												: h("div", { className: "wb_skGroup" },
													h("div", { className: "wb_skCap" },
														"可用技能 · " + skills.skills.length + " 个"
														+ (skills.skills[0].provider === "" ? "" : "（" + skills.skills[0].provider + "）")),
													h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
														skills.skills.map(function (skill) {
															var on = picked.indexOf(skill.name) >= 0;
															return h("button", {
																type: "button", key: skill.name,
																className: "wb_chipBtn", "data-on": on ? "1" : "0",
																title: skill.description + (skill.whenToUse === "" ? "" : "\n" + skill.whenToUse),
																onClick: function () {
																	setPicked(on
																		? picked.filter(function (n) { return n !== skill.name; })
																		: picked.concat([skill.name]));
																	setChipOff(false);
																},
															}, (on ? "✓ " : "") + skill.name);
														}))))) : null),

					/* ---- A6 底座 + A7 放大 ---- */
					h("div", { className: "wb_base", "data-zoom": zoom ? "1" : "0" },
						h("div", { className: "wb_box" },
							h("textarea", {
								ref: baseRef, className: "wb_input", rows: 1,
								placeholder: "补充要求（选填）…",
								value: base,
								onChange: function (e) { setBase(e.target.value); setChipOff(false); },
							}),
							h("button", {
								type: "button", className: "wb_zoom", title: zoom ? "收起" : "放大编辑",
								onClick: function () { setZoom(!zoom); },
							}, "⤢ " + (zoom ? "收起" : "放大")),
							h("div", { className: "wb_actions" },
								chipOff || clientName === "" ? null : h("span", { className: "wb_chip" },
									h("span", null, chip),
									h("button", {
										type: "button", className: "wb_chipX", title: "去掉",
										onClick: function () { setChipOff(true); },
									}, "×")),
								h("button", {
									type: "button", className: "wb_send",
									disabled: clientName === "" || sending !== "",
									onClick: dispatch,
								}, "发送"))),
						sending === "" ? null : h("div", { className: "wb_emptyS wb_bad" }, sending))));
		}

		/* ---- wiring ------------------------------------------------------- */
		function apply(ctx, config) {
			/* 覆盖 sidebar 的「新会话」文本。用单语言的 untyped 形式
			 * （register(ns, locale, dict)）：typed 形式要求 namespace 在
			 * 合并表里、且每个内置语言都齐 —— 这里不满足就静默，别让它炸。
			 * sidebar 命名空间可能已有占用者，重复注册会抛，同样吞掉。 */
			if (ctx.locale && typeof ctx.locale.register === "function") {
				ctx.effect(function() {
					try {
						ctx.locale.register("sidebar", "zh", { "session.new": "新建任务", "session.new.label": "新建任务" });
						ctx.locale.register("sidebar", "en", { "session.new": "New Task", "session.new.label": "New task" });
					} catch (error) {
						console.log("[dsh-workbench] sidebar 文案没覆盖上（可能已被占用）：", String(error && error.message ? error.message : error));
					}
				}, "dsh-workbench: override sidebar text");
			}

			var style = injectStyles();
			if (style !== null && ctx && typeof ctx.effect === "function") {
				ctx.effect(function () { return function () {
					if (style.parentNode !== null) style.parentNode.removeChild(style);
				}; }, "dsh-workbench: remove the workbench stylesheet");
			}

			ctx.slots.inject("main", function () {
				return ctx.slots.register({ name: "main", key: WORKBENCH_KEY }, function () {
					return h(WorkbenchPage, { ctx: ctx });
				});
			});
			ctx.slots.inject("sidebar.panellist", function () {
				return ctx.slots.register({
					name: "sidebar.panellist",
					id: WORKBENCH_KEY,
					label: "工作台",
					order: 20,
				}, WorkbenchIcon);
			});
			/* 会话域的接力挂件 —— 装配台发出去的那句话靠它落地。 */
			ctx.slots.inject("conversation.composer.dock", function () {
				return ctx.slots.register({
					name: "conversation.composer.dock",
					id: "workbench-prompt-relay",
					order: 90,
				}, PromptRelay);
			});

			/* 进来就落在工作台。布局自己的初始选择在我们后面才落定，所以延后。 */
			var defaultPanel = (config !== null && typeof config === "object"
				&& typeof config.defaultPanel === "string") ? config.defaultPanel : WORKBENCH_KEY;
			if (defaultPanel !== "") {
				var select = function () {
					try {
						ctx.layout.selectPanel(defaultPanel);
					} catch (error) {
						console.log("[dsh-workbench] 没落到默认面板：", String(error && error.message ? error.message : error));
					}
				};
				setTimeout(select, 250);
				setTimeout(select, 900);
			}
		}

		exports.inject = ["slots", "layout", "locale"];
		exports.apply = apply;
		return module.exports;
	}
});
