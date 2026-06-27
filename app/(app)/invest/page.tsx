import { getCurrentOwnerId } from "@/lib/auth";
import { getPortfolioStatus } from "@/lib/connectors/robinhood";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const ALLOC_COLORS = ["var(--office)", "var(--dev)", "var(--life)", "var(--amber)"];

export default async function InvestPage() {
  const ownerId = await getCurrentOwnerId();
  const status = await getPortfolioStatus(ownerId);

  return (
    <section className="investwrap">
      <div className="vh" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="eyebrow">System of Record · FR34</span>
          <h2>Investments</h2>
        </div>
        <span className="ro-badge">🔒 Read-only · Robinhood</span>
      </div>

      {!status ? (
        <div className="empty" style={{ padding: 48 }}>
          🔌 Robinhood not connected for this user.
          <br />
          <br />
          Each person connects their own account (read-only). Data is never shared between household members.
        </div>
      ) : (
        <>
          <div className="totalcard">
            <div className="tl">Total portfolio value</div>
            <div className="tv">{fmt(status.totalValue)}</div>
            <div className={`tc ${status.dayChange >= 0 ? "up" : "down"}`}>
              {status.dayChange >= 0 ? "▲" : "▼"} {fmt(Math.abs(status.dayChange))} ({status.dayChangePct.toFixed(2)}%) today
            </div>
            {status.allocation.length > 0 && (
              <>
                <div className="alloc">
                  {status.allocation.map((a, i) => (
                    <i key={a.label} style={{ width: `${a.pct}%`, background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
                  ))}
                </div>
                <div className="alloclegend">
                  {status.allocation.map((a, i) => (
                    <span key={a.label}>
                      <i style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
                      {a.label} {a.pct}%
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {status.concentration && status.concentration.pct >= 25 && (
            <div className="flag">
              ⚠ {status.concentration.symbol} is ~{status.concentration.pct}% of your portfolio — concentrated. (Status only — not advice.)
            </div>
          )}

          <div>
            {status.holdings.map((h) => (
              <div className="hold" key={h.symbol}>
                <span className="sym">{h.symbol}</span>
                <span className="nm">{h.qty} sh</span>
                <span className="vv">{fmt(h.value)}</span>
                <span className={`dd ${h.dayChangePct >= 0 ? "up" : "down"}`}>
                  {h.dayChangePct >= 0 ? "+" : ""}
                  {h.dayChangePct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>

          <div className="invnote">
            Read-only via the official Robinhood connector. Information only — the agent never places or rebalances trades, and gives no buy/sell advice.
          </div>
        </>
      )}
    </section>
  );
}
