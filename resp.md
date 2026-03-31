 nx run sales-dashboard:build:production

[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
 ⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
 We detected multiple lockfiles and selected the directory of /home/sentra-core/package-lock.json as the root directory.
 To silence this warning, set `turbopack.root` in your Next.js config, or consider removing one of the lockfiles if it's not needed.
   See https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory for more information.
 Detected additional lockfiles:
   * /home/sentra-core/apps/frontend/sales-dashboard/package-lock.json

   ▲ Next.js 16.0.11 (Turbopack)
   - Environments: .env.local

   Creating an optimized production build ...
[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
 ✓ Compiled successfully in 65s
   Running TypeScript  ...Failed to compile.

./src/components/shared/comm/alerts-panel.tsx:124:34
Type error: Argument of type 'string | undefined' is not assignable to parameter of type 'string | Date'.
  Type 'undefined' is not assignable to type 'string | Date'.

  122 |                       </div>
  123 |                       <span className="shrink-0 text-[10px] text-muted-foreground/70">
> 124 |                         {timeAgo(alert.lastTriggeredAt ?? alert.firstTriggeredAt)}
      |                                  ^
  125 |                       </span>
  126 |                     </div>
  127 |                   </button>
Next.js build worker exited with code: 1 and signal: null
Build process exited due to code 1


   ✔  nx run pm-dashboard:build:production
   ✔  nx run hrms-dashboard:build:production
   ✖  nx run sales-dashboard:build:production

————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————

 NX   Ran target build for 3 projects (2m)

   ✔  2/3 succeeded [0 read from cache]

   ✖  1/3 targets failed, including the following:

      - nx run sales-dashboard:build:production



root@server1:/home/sentra-core#
