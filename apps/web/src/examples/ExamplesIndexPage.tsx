// The examples index (/examples). A public, unauthenticated gallery of the
// standalone interactive teaching examples registered in ./registry.ts. An
// instructor can browse here and link any example into their course material
// by its stable URL.

import { Link } from "react-router-dom";
import { Wordmark } from "../components/index.js";
import { EXAMPLES } from "./registry.js";
import "./examples.css";

export function ExamplesIndexPage() {
  return (
    <div className="app">
      {/* DS topbar, matching the student shell: red mono wordmark, left. */}
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Wordmark size="sm" />
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="examples-page">
          {/* Left-justified eyebrow -> heading lockup, DS home register. */}
          <div className="examples-head">
            <p className="eyebrow">Examples</p>
            <h1>Interactive teaching examples</h1>
            <p className="examples-lede">
              Self-contained, hands-on illustrations you can point students at.
              Each one runs entirely in the browser — no sign-in, nothing to set
              up. Link any of them directly into your course.
            </p>
          </div>

          <ul className="examples-grid">
            {EXAMPLES.map((ex) => (
              <li key={ex.slug}>
                <Link to={`/examples/${ex.slug}`} className="examples-card">
                  <span className="examples-card__glyph" aria-hidden>{ex.glyph}</span>
                  <span className="examples-card__title">{ex.title}</span>
                  <span className="examples-card__blurb">{ex.blurb}</span>
                  <span className="examples-card__tags">
                    {ex.tags.map((t) => (
                      <span key={t} className="examples-card__tag">{t}</span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
