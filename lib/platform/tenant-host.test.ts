import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companySlugFromHost } from "./tenant-host";

/**
 * Which customer a request came for.
 *
 * This runs before anybody has signed in, so a wrong answer shows one customer another's login
 * screen and branding. Every uncertain case has to come back null and fall through to the
 * deployment's own company, which is why the rule is this strict and this tested.
 */

const BASE = "bighawk.sa";

describe("reading a company from the host", () => {
  it("reads a single subdomain as the company's slug", () => {
    assert.equal(companySlugFromHost("acme.bighawk.sa", BASE), "acme");
    assert.equal(companySlugFromHost("acme-trading.bighawk.sa", BASE), "acme-trading");
  });

  it("ignores the port and the case, which are not part of the name", () => {
    assert.equal(companySlugFromHost("ACME.BigHawk.SA:3000", BASE), "acme");
  });

  it("says nothing for the deployment's own domain", () => {
    assert.equal(companySlugFromHost("bighawk.sa", BASE), null);
    assert.equal(companySlugFromHost("www.bighawk.sa", BASE), null);
  });

  it("says nothing when host routing is not configured", () => {
    // Most installs serve one company. Then there is no subdomain to read and none is invented.
    assert.equal(companySlugFromHost("acme.bighawk.sa", null), null);
    assert.equal(companySlugFromHost("acme.bighawk.sa", ""), null);
  });

  it("says nothing in development", () => {
    assert.equal(companySlugFromHost("localhost:3000", BASE), null);
    assert.equal(companySlugFromHost("127.0.0.1:3000", BASE), null);
    assert.equal(companySlugFromHost("192.168.1.10", BASE), null);
  });

  it("refuses a host that is not under the base domain at all", () => {
    /** The dangerous case: a `Host` header is attacker-controlled on a misconfigured proxy. */
    assert.equal(companySlugFromHost("acme.evil.example", BASE), null);
    assert.equal(companySlugFromHost("bighawk.sa.evil.example", BASE), null);
    assert.equal(companySlugFromHost("notbighawk.sa", BASE), null);
  });

  it("refuses more than one label, which is nobody's customer", () => {
    assert.equal(companySlugFromHost("a.b.bighawk.sa", BASE), null);
  });

  it("refuses the names the deployment keeps for itself", () => {
    for (const reserved of ["www", "app", "admin", "api", "static", "assets"]) {
      assert.equal(companySlugFromHost(`${reserved}.bighawk.sa`, BASE), null, reserved);
    }
  });

  it("refuses anything that could not be a slug, so it never reaches a query", () => {
    assert.equal(companySlugFromHost("-acme.bighawk.sa", BASE), null);
    assert.equal(companySlugFromHost("ac_me.bighawk.sa", BASE), null);
    assert.equal(companySlugFromHost(`${"a".repeat(70)}.bighawk.sa`, BASE), null);
  });

  it("copes with a base domain written with a leading dot", () => {
    assert.equal(companySlugFromHost("acme.bighawk.sa", ".bighawk.sa"), "acme");
  });

  it("copes with nothing at all rather than throwing inside a request", () => {
    assert.equal(companySlugFromHost(null, BASE), null);
    assert.equal(companySlugFromHost(undefined, BASE), null);
    assert.equal(companySlugFromHost("", BASE), null);
  });
});
