export async function fetchFreshAwashNonce(): Promise<string> {
  const token = process.env.BROWSERLESS_TOKEN;

  if (!token) {
    throw new Error("BROWSERLESS_TOKEN is not configured.");
  }

  const code = `
export default async ({ page }) => {
  const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  function extractNonceFromText(text) {
    if (!text) {
      return null;
    }

    const patterns = [
      /exchangeRatesVars[\\\\s\\\\S]{0,2500}?["']nonce["']\\\\s*:\\\\s*["']([^"']+)["']/i,

      /exchangeRatesVars[\\\\s\\\\S]{0,2500}?nonce\\\\s*:\\\\s*["']([^"']+)["']/i,

      /get_exchange_rates[\\\\s\\\\S]{0,2500}?["']nonce["']\\\\s*:\\\\s*["']([^"']+)["']/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);

      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  async function findNonce() {
    return await page.evaluate(() => {
      function extract(text) {
        if (!text) {
          return null;
        }

        const patterns = [
          /exchangeRatesVars[\\\\s\\\\S]{0,2500}?["']nonce["']\\\\s*:\\\\s*["']([^"']+)["']/i,

          /exchangeRatesVars[\\\\s\\\\S]{0,2500}?nonce\\\\s*:\\\\s*["']([^"']+)["']/i,

          /get_exchange_rates[\\\\s\\\\S]{0,2500}?["']nonce["']\\\\s*:\\\\s*["']([^"']+)["']/i
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);

          if (match?.[1]) {
            return match[1];
          }
        }

        return null;
      }

      // 1. Direct window variable.
      try {
        const vars = window.exchangeRatesVars;

        if (vars?.nonce) {
          return vars.nonce;
        }
      } catch {
        // ignore
      }

      // 2. Search every script's inline text and src.
      for (const script of Array.from(document.scripts)) {
        const inlineText =
          script.textContent ||
          script.innerHTML ||
          "";

        const inlineNonce = extract(inlineText);

        if (inlineNonce) {
          return inlineNonce;
        }

        const src =
          script.getAttribute("src") ||
          "";

        if (src.startsWith("data:text/javascript;base64,")) {
          try {
            const encoded =
              src.substring(
                "data:text/javascript;base64,".length
              );

            const decoded = atob(encoded);

            const decodedNonce =
              extract(decoded);

            if (decodedNonce) {
              return decodedNonce;
            }
          } catch {
            // ignore invalid/unrelated data URLs
          }
        }
      }

      // 3. Search the fully rendered DOM.
      const html =
        document.documentElement?.outerHTML ||
        "";

      const htmlNonce =
        extract(html);

      if (htmlNonce) {
        return htmlNonce;
      }

      // 4. Look in browser storage in case the site's JS
      //    cached configuration there.
      for (const storage of [
        window.localStorage,
        window.sessionStorage
      ]) {
        try {
          for (
            let i = 0;
            i < storage.length;
            i++
          ) {
            const key =
              storage.key(i);

            if (!key) {
              continue;
            }

            const value =
              storage.getItem(key) ||
              "";

            const combined =
              \`\${key} \${value}\`;

            if (
              !/exchange|rate/i.test(
                combined
              )
            ) {
              continue;
            }

            const storedNonce =
              extract(combined);

            if (storedNonce) {
              return storedNonce;
            }

            try {
              const parsed =
                JSON.parse(value);

              if (
                parsed &&
                typeof parsed === "object" &&
                typeof parsed.nonce === "string" &&
                parsed.nonce
              ) {
                return parsed.nonce;
              }
            } catch {
              // not JSON
            }
          }
        } catch {
          // storage may be unavailable
        }
      }

      return null;
    });
  }

  async function clickExchangeRate() {
    return await page.evaluate(() => {
      const elements = Array.from(
        document.querySelectorAll(
          "a, button, [role='button'], div, span"
        )
      );

      const candidates = elements.filter(
        (element) => {
          const text =
            (
              element.textContent ||
              ""
            )
              .replace(/\\\\s+/g, " ")
              .trim()
              .toLowerCase();

          return (
            text === "exchange rate" ||
            text === "exchange rates" ||
            text.includes(
              "exchange rate"
            )
          );
        }
      );

      for (const candidate of candidates) {
        try {
          candidate.scrollIntoView({
            block: "center",
            inline: "center"
          });

          candidate.click();

          return true;
        } catch {
          // try next candidate
        }
      }

      return false;
    });
  }

  async function attemptFind() {
    // Give delayed/lazy scripts several chances to execute.
    for (let attempt = 1; attempt <= 4; attempt++) {
      const nonce =
        await findNonce();

      if (nonce) {
        return {
          nonce,
          attempt
        };
      }

      // Scroll so lazy-loaded widgets/scripts get a chance to run.
      await page.evaluate(() => {
        window.scrollTo({
          top:
            document.body.scrollHeight,
          behavior: "instant"
        });
      });

      await sleep(2500);
    }

    return null;
  }

  await page.goto(
    "https://awashbank.com/",
    {
      waitUntil: "domcontentloaded",
      timeout: 60000
    }
  );

  await sleep(6000);

  // First pass without clicking.
  let found =
    await attemptFind();

  if (found?.nonce) {
    return {
      data: {
        nonce: found.nonce,
        source: "initial",
        attempt: found.attempt
      },
      type: "application/json"
    };
  }

  // Try opening the exchange-rate widget.
  const clicked =
    await clickExchangeRate();

  if (clicked) {
    await sleep(6000);

    found =
      await attemptFind();

    if (found?.nonce) {
      return {
        data: {
          nonce: found.nonce,
          clicked: true,
          source: "after-click",
          attempt: found.attempt
        },
        type: "application/json"
      };
    }
  }

  // Awash/LiteSpeed sometimes serves a different cached
  // version on the next navigation. Reload once.
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await sleep(7000);

  found =
    await attemptFind();

  if (found?.nonce) {
    return {
      data: {
        nonce: found.nonce,
        clicked,
        source: "after-reload",
        attempt: found.attempt
      },
      type: "application/json"
    };
  }

  // One last click after reload.
  const clickedAfterReload =
    await clickExchangeRate();

  if (clickedAfterReload) {
    await sleep(6000);

    found =
      await attemptFind();

    if (found?.nonce) {
      return {
        data: {
          nonce: found.nonce,
          clicked: true,
          source: "reload-after-click",
          attempt: found.attempt
        },
        type: "application/json"
      };
    }
  }

  return {
    data: {
      nonce: null,
      clicked:
        clicked ||
        clickedAfterReload,
      title:
        await page.title(),
      url:
        page.url()
    },
    type: "application/json"
  };
};
`;

  const response = await fetch(
    `https://production-sfo.browserless.io/function?token=${encodeURIComponent(
      token
    )}&stealth=true&headless=false`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        code
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const errorBody =
      await response.text();

    throw new Error(
      `Browserless returned HTTP ${response.status}: ${errorBody}`
    );
  }

  const result =
    (await response.json()) as {
      nonce?: string | null;
      clicked?: boolean;
      source?: string;
      data?: {
        nonce?: string | null;
        clicked?: boolean;
        source?: string;
        attempt?: number;
        title?: string;
        url?: string;
      };
    };

  const nonce =
    result.nonce ??
    result.data?.nonce ??
    null;

  if (!nonce) {
    throw new Error(
      `Browserless loaded Awash but still could not find a nonce. Response: ${JSON.stringify(
        result
      )}`
    );
  }

  console.log(
    "[awash-browser] fresh nonce found",
    {
      source:
        result.data?.source ??
        result.source ??
        "unknown",
      attempt:
        result.data?.attempt ??
        null
    }
  );

  return nonce;
}