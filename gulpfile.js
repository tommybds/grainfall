const gulp = require("gulp");
const plumber = require("gulp-plumber");
const browserSync = require("browser-sync").create();
const { deleteAsync } = require("del");
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { Transform } = require("stream");

const pkg = require("./package.json");

const paths = {
  src: "src",
  dist: "dist",
};

function clean() {
  // Remove dist entirely to avoid leftover empty folders.
  // It will be recreated by subsequent build steps (gulp.dest / esbuild outfile).
  return deleteAsync([paths.dist]);
}

function copy() {
  return gulp
    .src([`${paths.src}/**/*`], { since: gulp.lastRun(copy) })
    .pipe(plumber())
    .pipe(gulp.dest(paths.dist));
}

function bundleJs() {
  return esbuild.build({
    entryPoints: [`${paths.src}/main.js`],
    bundle: true,
    minify: true,
    sourcemap: true,
    format: "iife",
    target: ["es2018"],
    outfile: `${paths.dist}/assets/bundle.js`,
    define: {
      "process.env.NODE_ENV": '"production"',
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  });
}

function copyCss() {
  return gulp.src([`${paths.src}/styles.css`]).pipe(plumber()).pipe(gulp.dest(paths.dist));
}

function copyHtmlProd() {
  const replace = new Transform({
    objectMode: true,
    transform(file, _enc, cb) {
      const rewrite = (s) => {
        // Use bundled JS in prod
        let out = s.replace(
          /<script\s+src="\.\/main\.js"\s+type="module"><\/script>/g,
          '<script src="./assets/bundle.js" defer></script>',
        );

        // Inject version from package.json into the HTML (so it's visible even before JS runs)
        const v = `v${pkg.version}`;
        out = out.replace(/(<div class="menuVersion"\s+id="menuVersion">)[^<]*(<\/div>)/g, `$1${v}$2`);
        out = out.replace(/(<span class="version"\s+id="appVersion">)[^<]*(<\/span>)/g, `$1${v}$2`);
        return out;
      };

      // Vinyl file from gulp.src()
      if (file && typeof file.isBuffer === "function" && file.isBuffer()) {
        const s = file.contents.toString("utf8");
        file.contents = Buffer.from(rewrite(s), "utf8");
        cb(null, file);
        return;
      }

      if (file && typeof file.isStream === "function" && file.isStream()) {
        let data = "";
        file.contents.on("data", (chunk) => {
          data += chunk.toString("utf8");
        });
        file.contents.on("end", () => {
          file.contents = Buffer.from(rewrite(data), "utf8");
          cb(null, file);
        });
        file.contents.on("error", cb);
        return;
      }

      cb(null, file);
    },
  });
  return gulp.src([`${paths.src}/index.html`]).pipe(plumber()).pipe(replace).pipe(gulp.dest(paths.dist));
}

function copyOther() {
  // copy assets/files needed at runtime.
  // JS is bundled by esbuild into dist/assets/bundle.js, so we avoid copying source *.js files.
  return gulp
    .src([
      `${paths.src}/**/*`,
      `!${paths.src}/**/*.js`,
      `!${paths.src}/main.js`,
      `!${paths.src}/index.html`,
      `!${paths.src}/styles.css`,
    ])
    .pipe(plumber())
    .pipe(gulp.dest(paths.dist));
}

async function pruneEmptyDirs(dir) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (_e) {
    return;
  }

  await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map((e) => pruneEmptyDirs(path.join(dir, e.name))),
  );

  // Re-check after pruning children
  const remaining = await fs.promises.readdir(dir);
  if (remaining.length === 0) {
    await fs.promises.rmdir(dir);
  }
}

async function pruneEmptyDist() {
  await pruneEmptyDirs(paths.dist);
}

function serveSrc(done) {
  browserSync.init({
    server: { baseDir: paths.src },
    port: 5173,
    open: false,
    notify: false,
  });
  done();
}

function serveDist(done) {
  browserSync.init({
    server: { baseDir: paths.dist },
    port: 4173,
    open: false,
    notify: false,
  });
  done();
}

function watchSrc() {
  gulp.watch([`${paths.src}/**/*`]).on("change", () => {
    browserSync.reload();
  });
}

const build = gulp.series(clean, gulp.parallel(copyHtmlProd, copyCss, copyOther, bundleJs), pruneEmptyDist);
const dev = gulp.series(serveSrc, watchSrc);

exports.clean = clean;
exports.copy = copy;
exports.build = build;
exports.dev = dev;
exports.serveDist = gulp.series(build, serveDist);

