import * as fs from 'fs';

import * as fsAdapter from './adapters/fs';

import * as optionsManager from './managers/options';

import * as scandirProvider from './providers/scandir';

import { Options } from './managers/options';
import { DirEntry } from './types/entry';

const fsAdapterAsync = new fsAdapter.FileSystemAsync();
const fsAdapterSync = new fsAdapter.FileSystemSync();

/**
 * Asynchronous API.
 */
export function scandir(path: fs.PathLike, opts?: Options): Promise<DirEntry[]> {
	return scandirProvider.async(fsAdapterAsync, path, optionsManager.prepare(opts));
}

/**
 * Synchronous API.
 */
export function scandirSync(path: fs.PathLike, opts?: Options): DirEntry[] {
	return scandirProvider.sync(fsAdapterSync, path, optionsManager.prepare(opts));
}
