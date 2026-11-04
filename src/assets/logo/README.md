The bundled `zandaka-logo.svg` was updated on 4 November 2026 using the approved Atlántico palette: a cobalt tile and three solid planes in white/turquoise. It is byte-identical to `zandaka-web/public/brand/zandaka-mark.svg`; keep these two copies synchronized when updating the identity. The vector has no scripts, fonts, external references, filters or embedded raster images.

It updates the default logo used by PDF and HTML exports without changing their template, snapshots or balances. Brand specification and regeneration instructions are in `zandaka-web/docs/brand.md`. Both repositories integrate on `staging`; publishing images does not deploy testing. No database preparation or migration is required for this asset update.

Place an optional custom Zandaka logo asset here for report exports. The following list is also the existing lookup priority after `ZANDAKA_LOGO_PATH`; adding a PNG/JPG may therefore override the bundled SVG. Do not delete an operator's custom asset or environment override as part of a visual update.

Supported filenames:

- `zandaka-logo.png`
- `zandaka-logo.jpg`
- `zandaka-logo.jpeg`
- `zandaka-logo.svg`
- `zandaka-logo.ico`

The PDF generator will also honor `ZANDAKA_LOGO_PATH` when set. If no logo file is found,
the report falls back to a text-based Zandaka mark so PDF generation never fails only because
an asset is missing.
