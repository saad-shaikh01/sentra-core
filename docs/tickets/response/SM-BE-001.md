Implemented SM-BE-001 and verified the Prisma side end to end. The migration was created at D:/Repositories/new%20crm/sentra-core/libs/backend/prisma-client/prisma/
  migrations/20260317162358_add_draft_status_discount_fields_activity_types/migration.sql, npx prisma migrate status reports the database is up to date, the new Prisma enums resolve at     
  runtime, and npx nx test core-service passed with 9/9 suites and 37/37 tests.

  Changed files:

  - D:/Repositories/new%20crm/sentra-core/libs/backend/prisma-client/prisma/schema.prisma
  - D:/Repositories/new%20crm/sentra-core/libs/backend/prisma-client/prisma/migrations/20260317162358_add_draft_status_discount_fields_activity_types/migration.sql
  - D:/Repositories/new%20crm/sentra-core/libs/shared/types/src/lib/types.ts
  - D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/sales.service.ts
  - D:/Repositories/new%20crm/sentra-core/apps/backend/core-service/src/modules/sales/__tests__/sale-status-enum.spec.ts

  One repo-level caveat: the exact root command npx tsc --noEmit does not type-check this Nx workspace because there is no root tsconfig.json; it prints the TypeScript help text. To perform
  the real compile verification, I also ran npx tsc --noEmit -p apps/backend/core-service/tsconfig.json, which exited with zero errors and no output.


  Exact output of npx tsc --noEmit:

  Version 5.9.3
  tsc: The TypeScript Compiler - Version 5.9.3

  COMMON COMMANDS

    tsc
    Compiles the current project (tsconfig.json in the working directory.)

    tsc app.ts util.ts
    Ignoring tsconfig.json, compiles the specified files with default compiler options.

    tsc -b
    Build a composite project in the working directory.

tsc --init
    Creates a tsconfig.json with the recommended settings in the working directory.

    tsc -p ./path/to/tsconfig.json
    Compiles the TypeScript project located at the specified path.
 
    tsc --help --all
    An expanded version of this information, showing all possible compiler options

    tsc --noEmit
    tsc --target esnext
    Compiles the current project, with additional settings.

  COMMAND LINE FLAGS

  --help, -h
  Print this message.

  --watch, -w
  Watch input files.

  --all
  Show all compiler options.

  --version, -v
  Print the compiler's version.

  --init
  Initializes a TypeScript project and creates a tsconfig.json file.

--project, -p
  Compile the project given the path to its configuration file, or to a folder with a 'tsconfig.json'.

  --showConfig
  Print the final configuration instead of building.
 
  --build, -b
  Build one or more projects and their dependencies, if out of date

  COMMON COMPILER OPTIONS
 
  --pretty
  Enable color and formatting in TypeScript's output to make compiler errors easier to read.
  type: boolean
  default: true

  --declaration, -d
  Generate .d.ts files from TypeScript and JavaScript files from a compilation.
  type: boolean
  default: `false`, unless `composite` is set

  --declarationMap
  Create sourcemaps for d.ts files.
  type: boolean
  default: false

  --emitDeclarationOnly
  Only output d.ts files and not JavaScript files.
  type: boolean
  default: false

 --sourceMap
  Create source map files for emitted JavaScript files.
  type: boolean
  default: false

  --noEmit
  Disable emitting files from a compilation.
  type: boolean
  default: false
 
  --target, -t
  Set the JavaScript language version for emitted JavaScript and include compatible library declarations.
  one of: es5, es6/es2015, es2016, es2017, es2018, es2019, es2020, es2021, es2022, es2023, es2024, esnext
  default: es5

  --module, -m
  Specify what module code is generated.
  one of: none, commonjs, amd, umd, system, es6/es2015, es2020, es2022, esnext, node16, node18, node20, nodenext, preserve
  default: undefined

  --lib
  Specify a set of bundled library declaration files that describe the target runtime environment.
  one or more: es5, es6/es2015, es7/es2016, es2017, es2018, es2019, es2020, es2021, es2022, es2023, es2024, esnext, dom, dom.iterable, dom.asynciterable, webworker, webworker.importscripts,
  webworker.iterable, webworker.asynciterable, scripthost, es2015.core, es2015.collection, es2015.generator, es2015.iterable, es2015.promise, es2015.proxy, es2015.reflect, es2015.symbol, es 
  2015.symbol.wellknown, es2016.array.include, es2016.intl, es2017.arraybuffer, es2017.date, es2017.object, es2017.sharedmemory, es2017.string, es2017.intl, es2017.typedarrays, es2018.async 
  generator, es2018.asynciterable/esnext.asynciterable, es2018.intl, es2018.promise, es2018.regexp, es2019.array, es2019.object, es2019.string, es2019.symbol/esnext.symbol, es2019.intl,     
  es2020.bigint/esnext.bigint, es2020.date, es2020.promise, es2020.sharedmemory, es2020.string, es2020.symbol.wellknown, es2020.intl, es2020.number, es2021.promise, es2021.string,
  es2021.weakref/esnext.weakref, es2021.intl, es2022.array, es2022.error, es2022.intl, es2022.object, es2022.string, es2022.regexp, es2023.array, es2023.collection, es2023.intl, es2024.arra
  ybuffer, es2024.collection, es2024.object/esnext.object, es2024.promise, es2024.regexp/esnext.regexp, es2024.sharedmemory, es2024.string/esnext.string, esnext.array, esnext.collection, es 
  next.intl, esnext.disposable, esnext.promise, esnext.decorators, esnext.iterator, esnext.float16, esnext.error, esnext.sharedmemory, decorators, decorators.legacy
  default: undefined
 --allowJs
  Allow JavaScript files to be a part of your program. Use the 'checkJs' option to get errors from these files.
  type: boolean
  default: false

  --checkJs
  Enable error reporting in type-checked JavaScript files.
  type: boolean
  default: false
 
  --jsx
  Specify what JSX code is generated.
  one of: preserve, react, react-native, react-jsx, react-jsxdev
  default: undefined

  --outFile
  Specify a file that bundles all outputs into one JavaScript file. If 'declaration' is true, also designates a file that bundles all .d.ts output.

  --outDir
  Specify an output folder for all emitted files.

  --removeComments
  Disable emitting comments.
  type: boolean
  default: false

  --strict
  Enable all strict type-checking options.
  type: boolean
  default: false

  --types
  Specify type package names to be included without being referenced in a source file.

 
  --esModuleInterop
  Emit additional JavaScript to ease support for importing CommonJS modules. This enables 'allowSyntheticDefaultImports' for type compatibility.
  type: boolean
  default: false

  You can learn about all of the compiler options at https://aka.ms/tsc