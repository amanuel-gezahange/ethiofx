export async function fetchFreshAwashNonce(): Promise<string> {
  const token = process.env.BROWSERLESS_TOKEN;

  if (!token) {
    throw new Error("BROWSERLESS_TOKEN is not configured.");
  }

  const code = `
export default async ({ page }) => {
  await page.goto("https://awashbank.com/", {
    waitUntil: "networkidle2",
    timeout: 45000
  });

  const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  await sleep(5000);

  async function findNonce() {
    return await page.evaluate(() => {
      // 1. Normal window variable
      if (
        window.exchangeRatesVars &&
        window.exchangeRatesVars.nonce
      ) {
        return window.exchangeRatesVars.nonce;
      }

      // 2. Search normal inline scripts
      for (const script of Array.from(document.scripts)) {
        const text = script.textContent || "";

        const direct = text.match(
          /exchangeRatesVars\\s*=\\s*\\{[\\s\\S]*?["']nonce["']\\s*:\\s*["']([^"']+)["']/i
        );

        if (direct?.[1]) {
          return direct[1];
        }

        // 3. Search base64 data:text/javascript scripts
        const src = script.getAttribute("src") || "";

        if (src.startsWith("data:text/javascript;base64,")) {
          try {
            const encoded = src.split(",")[1];
            const decoded = atob(encoded);

            const match = decoded.match(
              /exchangeRatesVars\\s*=\\s*\\{[\\s\\S]*?["']nonce["']\\s*:\\s*["']([^"']+)["']/i
            );

            if (match?.[1]) {
              return match[1];
            }
          } catch {
            // ignore unrelated data scripts
          }
        }
      }

      return null;
    });
  }

  // Try before clicking anything
  let nonce = await findNonce();

  if (nonce) {
    return {
      data: { nonce },
      type: "application/json"
    };
  }

  // Click the floating "Exchange Rate" button
  const clicked = await page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll("a, button, div")
    );

    const target = elements.find((el) => {
      const text = (el.textContent || "")
        .replace(/\\s+/g, " ")
        .trim()
        .toLowerCase();

      return text === "exchange rate";
    });

    if (!target) {
      return false;
    }

    target.click();
    return true;
  });

  if (clicked) {
    await sleep(5000);
  }

  nonce = await findNonce();

  return {
    data: {
      nonce,
      clicked
    },
    type: "application/json"
  };
};
`;

  const response = await fetch(
    `https://production-sfo.browserless.io/function?token=${encodeURIComponent(token)}&stealth=true&headless=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Browserless returned HTTP ${response.status}: ${errorBody}`
    );
  }

  const result = (await response.json()) as {
    nonce?: string | null;
    clicked?: boolean;
    data?: {
      nonce?: string | null;
      clicked?: boolean;
    };
  };

  const nonce =
    result.nonce ??
    result.data?.nonce ??
    null;

  if (!nonce) {
    throw new Error(
      `Browserless loaded Awash but still could not find a nonce. Response: ${JSON.stringify(result)}`
    );
  }

  return nonce;
}