import { describe, expect, it } from "vitest";
import { isAdminPath, isProtectedPath, safeNext } from "@/lib/paths";

describe("route rules", () => {
  it("protects every signed-in and admin area", () => {
    for (const p of ["/dashboard", "/jobs", "/jobs/123", "/applications", "/cvs", "/profiles", "/profiles/new", "/auto-apply", "/notifications", "/account", "/onboarding", "/admin", "/admin/users", "/api/admin/invites"]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
  });
  it("leaves public pages open", () => {
    for (const p of ["/", "/login", "/signup", "/privacy", "/verify-email", "/api/health", "/auth/callback", "/administrator", "/jobsboard"]) {
      expect(isProtectedPath(p), p).toBe(false);
    }
  });
  it("marks only admin areas as admin", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/sources")).toBe(true);
    expect(isAdminPath("/api/admin/users")).toBe(true);
    expect(isAdminPath("/dashboard")).toBe(false);
    expect(isAdminPath("/administrator")).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/jobs?score=80")).toBe("/jobs?score=80");
  });
  it("refuses anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined, "/a\nb"]) {
      expect(safeNext(bad), String(bad)).toBe("/dashboard");
    }
  });
});
