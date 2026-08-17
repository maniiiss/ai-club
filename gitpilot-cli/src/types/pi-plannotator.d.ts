/** @plannotator/pi-extension exports a Pi ExtensionFactory from TypeScript source. */
declare module "@plannotator/pi-extension" {
	import type { ExtensionFactory } from "../core/extensions/types.ts";
	const factory: ExtensionFactory;
	export default factory;
}
