<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8b471e84-8acb-471c-b841-b22ff5ad0827

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## WPS inventory synchronization

The app can synchronize any number of inventory workbooks through the WPS Open
Platform v7 API.

1. Copy `.env.example` to `.env.local` and configure the shared WPS App ID,
   App Key, and OAuth redirect URI.
2. Start the app and open **WPS 数据源** in the header.
3. Add or remove inventory sources as needed. All sources share the App ID,
   App Key, authorization, and field mapping; each source keeps its own File ID.
4. Configure a worksheet ID range for each source. The default range is `1–12`,
   corresponding to January through December.
5. Use **动态加载工作表** to query the workbook's real worksheet list. Month names
   such as `7月` are preferred; otherwise worksheet IDs `1–12` map to the matching
   month. Hidden, empty, and template worksheets are skipped.
6. Run synchronization to read every discovered month in the configured range.
   Each month is merged into its own local month view, while a failed worksheet
   keeps the existing local data for that source and month.

The parser matches the source workbook layout:

- Row 1: merged workbook title
- Rows 2–3: two-level headers
- Columns A–H: model, batch, specification, shelf, totals, and remarks
- Columns I–BR: 31 pairs of daily inbound/outbound quantities

Merged product-model groups are inherited by their following batch rows. A
meaningful row without a batch number is preserved as `未标批次-<source row>`.
