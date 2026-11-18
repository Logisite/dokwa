import { CODE_PREFIX, TILL_DB, dbName } from "@dokwa/core";

/**
 * The base shell. It exists to prove three things and nothing else:
 *
 *   1. the workspace link to `@dokwa/core` resolves through Vite
 *   2. the app builds and boots on one origin
 *   3. a page can be deployed to Vercel and opened on a phone
 *
 * The room replaces this with the wallet and the till. Nothing here is a
 * fixture and nothing here is fake state — every value below is read from the
 * contract package at runtime.
 */
export default function App() {
  const facts: Array<[string, string]> = [
    ["contract", "@dokwa/core"],
    ["code prefix", CODE_PREFIX],
    ["till store", TILL_DB],
    ["wallet store", dbName({ wallet: "<id>" })],
    ["origin", location.origin],
    ["mode", location.protocol === "https:" ? "secure" : "insecure origin"],
  ];

  return (
    <main className="shell">
      <header>
        <h1>dokwa</h1>
        <p className="lede">
          The base. One origin, one bundle; the wallet and the till arrive here.
        </p>
      </header>

      <dl className="facts">
        {facts.map(([key, value]) => (
          <div key={key} className="fact">
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <footer>
        <p>
          Relays, mint and chain are not connected yet. When they are, they are
          connected for real.
        </p>
      </footer>
    </main>
  );
}
