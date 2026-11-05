/**
 * Provider Usage — Dashboard 插件页面
 * 纯 IIFE，无构建步骤、无外部依赖；通过 window.__HERMES_PLUGIN_SDK__
 * 获取 React 与 UI 组件，调用 GET /api/plugins/provider-usage/usage。
 */
(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;

  const { React } = SDK;
  const h = React.createElement;
  const { useEffect, useState } = SDK.hooks;
  const { Card, CardHeader, CardTitle, CardContent, Badge } = SDK.components;
  const { isoTimeAgo } = SDK.utils;

  const API = "/api/plugins/provider-usage/usage";

  // 后端 status 只有 ok / error；额度用尽时在界面上归为“限额”。
  const BADGE = {
    ok: { label: "可用", tone: "success" }, limited: { label: "限额", tone: "warning" },
    error: { label: "错误", tone: "destructive" }
  };

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function badgeOf(provider) {
    if (!provider || provider.status === "error") return BADGE.error;
    const windows = Array.isArray(provider.windows) ? provider.windows : [];
    const money = Array.isArray(provider.money) ? provider.money : [];
    const windowFull = windows.some(function (w) {
      const pct = num(w && w.percent);
      return pct !== null && pct >= 100;
    });
    const moneyEmpty = money.some(function (m) {
      const total = num(m && m.total);
      const left = num(m && m.left);
      return total !== null && left !== null && total > 0 && left <= 0;
    });
    return windowFull || moneyEmpty ? BADGE.limited : BADGE.ok;
  }

  function moneyText(value, currency) {
    const n = num(value);
    if (n === null) return "—";
    const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : "";
    return symbol ? symbol + n.toFixed(2) : n.toFixed(2) + " " + (currency || "");
  }

  function resetText(iso) {
    if (!iso) return "";
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return "";
    const delta = ts - Date.now();
    if (delta <= 0) return "即将重置";
    const mins = Math.round(delta / 60000);
    if (mins < 60) return mins + " 分钟后重置";
    const hours = Math.floor(mins / 60);
    if (hours < 36) {
      const rest = mins % 60;
      return hours + " 小时" + (rest ? " " + rest + " 分" : "") + "后重置";
    }
    return Math.round(hours / 24) + " 天后重置";
  }

  // SDK 的 isoTimeAgo 返回英文，这里转成中文；解析失败时显示“未知”。
  function updatedText(iso) {
    if (!iso) return "未知";
    let text = "";
    try { text = typeof isoTimeAgo === "function" ? isoTimeAgo(iso) : ""; } catch (e) { text = ""; }
    if (text === "just now") return "刚刚";
    if (!text || text === "unknown") return "未知";
    const mins = /^(\d+)m ago$/.exec(text);
    if (mins) return mins[1] + " 分钟前";
    const hours = /^(\d+)h ago$/.exec(text);
    if (hours) return hours[1] + " 小时前";
    const days = /^(\d+)d ago$/.exec(text);
    if (days) return days[1] + " 天前";
    return text;
  }

  function useUsage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(function () {
      let alive = true;
      setLoading(true);
      SDK.fetchJSON(API)
        .then(function (payload) {
          if (!alive) return;
          setData(payload || { providers: [] });
          setError(null);
        })
        .catch(function (err) {
          if (!alive) return;
          setError(String((err && err.message) || err));
        })
        .finally(function () { if (alive) setLoading(false); });
      return function () { alive = false; };
    }, []);

    return { data: data, error: error, loading: loading };
  }

  function WindowRow(props) {
    const w = props.window || {};
    const pct = num(w.percent);
    const used = pct === null ? null : Math.max(0, Math.min(100, pct));
    const barClass = used === null
      ? ""
      : used >= 100
        ? "bg-destructive"
        : used >= 80
          ? "bg-amber-500"
          : "bg-primary";
    return h("div", { className: "flex items-center gap-2 py-1 text-xs" },
      h("span", { className: "w-24 shrink-0 truncate text-muted-foreground" }, w.label || "额度"),
      h("div", { className: "h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" },
        used === null
          ? null
          : h("div", { className: "h-full rounded-full " + barClass, style: { width: used + "%" } })
      ),
      h("span", { className: "w-11 shrink-0 text-right tabular-nums" },
        used === null ? "—" : Math.round(used) + "%"
      ),
      h("span", { className: "w-28 shrink-0 text-right text-[11px] text-muted-foreground" },
        resetText(w.resets_at)
      )
    );
  }

  function MoneyRow(props) {
    const m = props.money || {};
    const left = num(m.left);
    const total = num(m.total);
    let value = "—";
    if (left !== null && total !== null && total > 0) {
      value = "已用 " + moneyText(total - left, m.cur) + " / 上限 " + moneyText(total, m.cur);
    } else if (left !== null) {
      value = "余额 " + moneyText(left, m.cur);
    }
    return h("div", { className: "flex items-center justify-between gap-3 py-1 text-xs" },
      h("span", { className: "shrink-0 text-muted-foreground" }, m.label || "余额"),
      h("span", { className: "min-w-0 truncate text-right tabular-nums" }, value)
    );
  }

  function ProviderCard(props) {
    const p = props.provider || {};
    const badge = badgeOf(p);
    const windows = Array.isArray(p.windows) ? p.windows : [];
    const money = Array.isArray(p.money) ? p.money : [];
    const empty = p.status !== "error" && windows.length === 0 && money.length === 0;

    return h(Card, { key: p.id || p.name },
      h(CardHeader, { className: "pb-2" },
        h("div", { className: "flex items-center justify-between gap-3" },
          h(CardTitle, { className: "text-base" },
            p.name || p.id || "未知 Provider",
            p.tag ? h("span", { className: "ml-2 text-xs font-normal text-muted-foreground" }, p.tag) : null
          ),
          h(Badge, { tone: badge.tone }, badge.label)
        )
      ),
      h(CardContent, { className: "space-y-0.5" },
        p.status === "error"
          ? h("p", { className: "text-sm text-destructive" },
              "读取失败：" + (p.error || "未知错误"))
          : null,
        windows.map(function (w, i) {
          return h(WindowRow, { key: w.label || i, window: w });
        }),
        money.map(function (m, i) {
          return h(MoneyRow, { key: m.label || i, money: m });
        }),
        empty
          ? h("p", { className: "text-sm text-muted-foreground" }, "暂无用量数据")
          : null
      )
    );
  }

  function Summary(props) {
    const data = props.data || {};
    const providers = Array.isArray(data.providers) ? data.providers : [];
    return h("div", { className: "flex flex-wrap items-end justify-between gap-2" },
      h("div", null,
        h("h2", { className: "text-lg font-semibold" }, "Provider 用量"),
        h("p", { className: "text-xs text-muted-foreground" }, "共 " + providers.length + " 个 Provider")
      ),
      h("span", { className: "text-xs text-muted-foreground" },
        "最后更新：" + updatedText(data.fetched_at)
      )
    );
  }

  function StateCard(props) {
    return h(Card, null,
      h(CardContent, { className: "p-6 text-sm " + (props.error ? "text-destructive" : "text-muted-foreground") },
        props.children
      )
    );
  }

  function ProviderUsagePage() {
    const state = useUsage();

    if (state.loading && !state.data) {
      return h("div", { className: "p-4" }, h(StateCard, null, "正在加载用量数据…"));
    }

    if (state.error && !state.data) {
      return h("div", { className: "p-4" },
        h(StateCard, { error: true }, "加载失败：" + state.error),
        h("p", { className: "mt-2 text-xs text-muted-foreground" }, "请确认 provider-usage 插件后端已启用，然后刷新页面重试。")
      );
    }

    const data = state.data || {};
    const providers = Array.isArray(data.providers) ? data.providers : [];

    return h("div", { className: "space-y-4 p-4" },
      h(Summary, { data: data }),
      state.error
        ? h("p", { className: "text-xs text-destructive" }, "刷新失败：" + state.error)
        : null,
      providers.length === 0
        ? h(StateCard, null,
            "未检测到可用的 Provider。请先在 Hermes 中配置至少一个 Provider 的凭据。")
        : h("div", { className: "grid gap-4 md:grid-cols-2 xl:grid-cols-3" },
            providers.map(function (p) {
              return h(ProviderCard, { key: p.id || p.name, provider: p });
            })
          )
    );
  }

  window.__HERMES_PLUGINS__.register("provider-usage", ProviderUsagePage);
})();
