import { describe, expect, it } from "vitest";
import { GET } from "./route";

async function download(name: string) {
  return GET(new Request(`http://localhost/api/intake-template?name=${name}`));
}

describe("GET /api/intake-template", () => {
  it.each([
    ["sites", "sites.csv", "site_id"],
    ["nature-interfaces", "nature-interfaces.csv", "layer_type"],
    ["engagement-config", "engagement-config.json", "deepDive"],
    ["waste", "waste.csv", "quantity_kg"],
    ["land-use", "land-use.csv", "activity_kind"],
  ])("keeps %s available as an allow-listed download", async (name, file, marker) => {
    const response = await download(name);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${file}"`);
    expect(await response.text()).toContain(marker);
  });

  it.each([
    ["prtr-honshi-sample", "honshi.txt", "東海化成株式会社（デモ）"],
    ["prtr-besshi-sample", "besshi.txt", "アクリロニトリル"],
    ["prtr-other-industries-sample", "other-industries.txt", "化学工業"],
  ])("preserves the CP932 bytes of %s", async (name, file, marker) => {
    const response = await download(name);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("charset=shift_jis");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${file}"`);
    const decoded = new TextDecoder("shift_jis", { fatal: true }).decode(await response.arrayBuffer());
    expect(decoded).toContain(marker);
  });

  it("downloads the UTF-8 PRTR facility crosswalk", async () => {
    const response = await download("prtr-crosswalk-sample");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="facility-crosswalk.csv"');
    expect(await response.text()).toContain("2023,DEMO-FAC-001,site-042");
  });

  it("returns 404 for unknown names without resolving user input as a path", async () => {
    const response = await download("../../package.json");
    expect(response.status).toBe(404);
  });
});
