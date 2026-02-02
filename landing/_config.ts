/**
 * Lume Configuration for Chipp Landing Page
 */

import lume from "lume/mod.ts";
import nunjucks from "lume/plugins/nunjucks.ts";
import sitemap from "lume/plugins/sitemap.ts";
import metas from "lume/plugins/metas.ts";
import postcss from "lume/plugins/postcss.ts";
import terser from "lume/plugins/terser.ts";

const site = lume({
  src: "./",
  dest: "./_site",
  location: new URL("https://chipp.ai"),
});

// Plugins
site.use(nunjucks());
site.use(sitemap());
site.use(metas());
site.use(postcss());
site.use(terser()); // Minify JS

// Copy static assets
site.copy("assets");

// Ignore patterns
site.ignore("README.md", "node_modules", "_site");

export default site;
