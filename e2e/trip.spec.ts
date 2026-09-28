import { expect, test, type Page, type Route } from "@playwright/test";

import { fixtureGtfs, fixturePassages, fixtureStops } from "./gtfs";

async function mockNetwork(page: Page) {
  const now = Date.now();
  await page.route("**/data/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/ride-graph.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/*grandlyon.com/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("GTFS") || url.endsWith(".ZIP")) {
      await route.fulfill({ body: fixtureGtfs, headers: { "content-type": "application/zip" } });
      return;
    }
    if (url.includes("tclarret")) {
      await route.fulfill({ json: { values: fixtureStops } });
      return;
    }
    if (url.includes("tclpassagearret")) {
      const stopId = Number(new URL(url).searchParams.get("value"));
      await route.fulfill({ json: { values: fixturePassages(stopId, now) } });
      return;
    }
    await route.fulfill({ json: {} });
  });
  await page.route("**/*data.gouv.fr/**", (route) => route.fulfill({ json: { features: [] } }));
}

test("la PWA répond avec les en-têtes de sécurité", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["content-security-policy"]).toContain("data.grandlyon.com");
  expect(response?.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  await expect(page.getByRole("heading", { name: "Arrêts" })).toBeVisible();
});

test("un trajet avec correspondance s'affiche", async ({ page }) => {
  await mockNetwork(page);
  await page.goto("/trip");
  await page.getByRole("textbox", { name: "Départ" }).fill("Alpha");
  await page.getByRole("button", { name: "Alpha, Lyon" }).click();
  await page.getByRole("textbox", { name: "Arrivée" }).fill("Gamma");
  await page.getByRole("button", { name: "Gamma, Lyon" }).click();

  await expect(page.getByText("1 correspondance")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Alpha → Beta")).toBeVisible();
  await expect(page.getByText("Beta → Gamma")).toBeVisible();
});
