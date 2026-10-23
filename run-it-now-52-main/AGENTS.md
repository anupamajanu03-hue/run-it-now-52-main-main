<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Finance chart series use the shared semantic map in `src/finance/chartColors.ts`, backed by complete CSS color tokens in `src/styles.css`; this prevents invalid color-function wrapping and keeps legends and tooltips aligned with series colors.
- Petty cash denominations and draft quantities live in the FinanceProvider reducer; saving appends an independent snapshot and Overview reads the latest saved total, so navigation and configuration edits cannot mutate saved counts.
