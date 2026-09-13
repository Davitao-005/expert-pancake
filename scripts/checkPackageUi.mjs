import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync("src/App.tsx", "utf8");
const cssSource = readFileSync("src/App.css", "utf8");

assert.match(appSource, /packageCategoryDefinitions\.map/);
assert.match(appSource, /No saved packages/);
assert.match(appSource, /Select a package/);
assert.match(appSource, /Export Packages/);
assert.match(appSource, /downloadParameterPackageLibrary/);
assert.match(appSource, /startDraftFromPackage/);
assert.match(appSource, /setDraftModule/);
assert.match(appSource, /package-trigger/);
assert.match(appSource, /package-menu/);
assert.match(appSource, /package-option-delete/);
assert.match(appSource, /event\.stopPropagation/);
assert.match(appSource, /Delete saved package/);
assert.match(appSource, /window\.confirm/);
assert.doesNotMatch(appSource, /package-card/);
assert.doesNotMatch(appSource, /package-main/);
assert.doesNotMatch(appSource, /package-list/);
assert.doesNotMatch(appSource, /Import Packages|Import JSON|package import/i);
assert.doesNotMatch(cssSource, /\.package-card/);
assert.doesNotMatch(cssSource, /\.package-main/);
assert.doesNotMatch(cssSource, /\.package-list/);
assert.match(cssSource, /\.package-category-list/);
assert.match(cssSource, /\.package-category/);
assert.match(cssSource, /\.package-trigger/);
assert.match(cssSource, /\.package-menu/);
assert.match(cssSource, /\.package-option-delete/);

console.log("Package UI checks passed.");
