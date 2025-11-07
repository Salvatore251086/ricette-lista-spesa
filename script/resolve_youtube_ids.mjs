name: Resolve YouTube IDs

on:
  workflow_dispatch:
    inputs:
      start:
        description: "Indice iniziale (es. 0, 300, 600)"
        required: true
        default: "0"
      limit:
        description: "Quante ricette processare"
        required: true
        default: "300"

permissions:
  contents: write

jobs:
  resolve:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      NODE_VERSION: 18
      START: ${{ github.event.inputs.start }}
      LIMIT: ${{ github.event.inputs.limit }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Resolve YouTube IDs
        env:
          YT_API_KEY: ${{ secrets.YT_API_KEY }}
          START: ${{ env.START }}
          LIMIT: ${{ env.LIMIT }}
        run: |
          node -v
          echo "Start ${START} Limit ${LIMIT}"
          node script/resolve_youtube_ids.mjs

      - name: Commit results
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          if [ -f assets/json/video_index.resolved.json ] && [ -s assets/json/video_index.resolved.json ]; then
            git add assets/json/video_index.resolved.json
          fi
          if git diff --cached --quiet; then
            echo "No changes"
          else
            git commit -m "resolver output"
            git push
          fi
