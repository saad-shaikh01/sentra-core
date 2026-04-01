> nx run types:build  [existing outputs match the cache, left as is]

Compiling TypeScript files for project "types"...
Done compiling TypeScript files for project "types".
Package type is set to "module" but "cjs" format is included. Going to use "esm" format instead. You can change the package type to "commonjs" or remove type in the package.json file.

> nx run comm-service:build

ERROR in ./src/modules/contacts/contacts.controller.ts:13:6
TS2693: 'OrgContext' only refers to a type, but is being used as a value here.
    11 |   @Get('search')
    12 |   async search(
  > 13 |     @OrgContext('organizationId') organizationId: string,
       |      ^^^^^^^^^^
    14 |     @Query('q') q: string,
    15 |   ) {
    16 |     const results = await this.contactsClient.searchContacts(organizationId, q ?? '');

webpack compiled with 1 error (0a3098e3a2bddf6b)

———————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————— 

 NX   Ran target build for project comm-service and 1 task(s) they depend on (1m)

   ×  1/2 failed
   √  1/2 succeeded [1 read from cache]


PS D:\Repositories\new crm\sentra-core> 