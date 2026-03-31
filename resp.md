PS D:\Repositories\new crm\sentra-core> npx nx build sales-dashboard --configuration=production

> nx run sales-dashboard:build:production

[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
 ⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
 We detected multiple lockfiles and selected the directory of D:\Repositories\new crm\sentra-core\package-lock.json as the root directory.
 To silence this warning, set `turbopack.root` in your Next.js config, or consider removing one of the lockfiles if it's not needed.      
   See https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory for more information.
 Detected additional lockfiles: 
   * D:\Repositories\new crm\sentra-core\apps\frontend\sales-dashboard\package-lock.json
   ▲ Next.js 16.0.11 (Turbopack)
   - Environments: .env.local
   Creating an optimized production build ...
[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
 ✓ Compiled successfully in 48s
   Running TypeScript ...
Failed to compile.

./src/components/shared/comm/tracking-state.tsx:222:20
Type error: Element implicitly has an 'any' type because expression of type 'CommReplyState' can't be used to index type 'Record<"waiting" | "fresh" | "ghosted" | "replied", { className: string; icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>; }>'. 
  Property 'none' does not exist on type 'Record<"waiting" | "fresh" | "ghosted" | "replied", { className: string; icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>; }>'.
  220 |     };
  221 |
> 222 |     const config = styles[replyState];
      |                    ^
  223 |     badges.push(
  224 |       <TrackingBadge
  225 |         key="reply"
Next.js build worker exited with code: 1 and signal: null
Build process exited due to code 1  

———————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————— 

 NX   Ran target build for project sales-dashboard (3m)

   ×  1/1 failed
   √  0/1 succeeded [0 read from cache]

PS D:\Repositories\new crm\sentra-core> 