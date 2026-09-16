/* Host half. This plugin is pure presentation: all of its work happens in the
   browser bundle (lib/client.js), reached through the package's dsh.client
   declaration. The loader still imports the package root as the row, so export
   the plugin shape here and keep it inert. */
export function apply() {}
