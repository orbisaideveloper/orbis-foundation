import "@testing-library/jest-dom/vitest";

import { beforeEach } from "vitest";

beforeEach(() => {
  if (typeof window === "undefined") return;
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("orbis.navigation.v1:")) window.localStorage.removeItem(key);
  }
});
