/**
 * Lume Configuration for Chipp Docs
 */

import lume from "lume/mod.ts";
import markdown from "lume/plugins/markdown.ts";
import prism from "lume/plugins/prism.ts";
import sitemap from "lume/plugins/sitemap.ts";
import metas from "lume/plugins/metas.ts";
import pagefind from "lume/plugins/pagefind.ts";
import nunjucks from "lume/plugins/nunjucks.ts";

const site = lume({
  src: "./",
  dest: "./_site",
  location: new URL("https://docs.chipp.ai"),
});

// Plugins
site.use(nunjucks());
site.use(markdown());
site.use(prism()); // Syntax highlighting
site.use(sitemap());
site.use(metas());
site.use(
  pagefind({
    ui: {
      containerId: "search",
      showImages: false,
    },
  })
);

// Copy static assets
site.copy("assets");

// Ignore patterns
site.ignore("README.md", "node_modules", "_site");

export default site;
