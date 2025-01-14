import { EventEmitter } from 'node:events';

import * as fastq from 'fastq';

import * as common from './common';

import type { IFileSystemAdapter } from '../adapters/fs';
import type { Settings } from '../settings';
import type { EndEventCallback, Entry, EntryEventCallback, ErrorEventCallback, QueueItem } from '../types';

export interface IAsyncReader {
	isDestroyed: boolean;

	onError: (callback: ErrorEventCallback) => void;
	onEntry: (callback: EntryEventCallback) => void;
	onEnd: (callback: EndEventCallback) => void;
	read: (root: string) => void;
	destroy: () => void;
}

class AsyncReaderEmitter {
	readonly #emitter = new EventEmitter();

	public onEntry(callback: EntryEventCallback): void {
		this.#emitter.on('entry', callback);
	}

	public onError(callback: ErrorEventCallback): void {
		this.#emitter.once('error', callback);
	}

	public onEnd(callback: EndEventCallback): void {
		this.#emitter.once('end', callback);
	}

	protected _emitEntry(entry: Entry): void {
		this.#emitter.emit('entry', entry);
	}

	protected _emitEnd(): void {
		this.#emitter.emit('end');
	}

	protected _emitError(error: Error): void {
		this.#emitter.emit('error', error);
	}
}

export class AsyncReader extends AsyncReaderEmitter implements IAsyncReader {
	#isFatalError: boolean = false;
	#isDestroyed: boolean = false;

	readonly #fs: IFileSystemAdapter;
	readonly #settings: Settings;
	readonly #queue: fastq.queue;

	constructor(fs: IFileSystemAdapter, settings: Settings) {
		super();

		const queue = fastq(this.#worker.bind(this), settings.concurrency);

		queue.drain = () => {
			if (!this.#isFatalError) {
				this._emitEnd();
			}
		};

		this.#fs = fs;
		this.#settings = settings;
		this.#queue = queue;
	}

	public read(root: string): void {
		this.#isFatalError = false;
		this.#isDestroyed = false;

		const directory = common.replacePathSegmentSeparator(root, this.#settings.pathSegmentSeparator);

		this.#pushToQueue(directory, this.#settings.basePath);
	}

	public get isDestroyed(): boolean {
		return this.#isDestroyed;
	}

	public destroy(): void {
		if (this.#isDestroyed) {
			return;
		}

		this.#isDestroyed = true;
		this.#queue.killAndDrain();
	}

	#pushToQueue(directory: string, base: string | undefined): void {
		this.#queue.push({ directory, base }, (error) => {
			if (error !== null) {
				this.#handleError(error);
			}
		});
	}

	#worker(item: QueueItem, done: fastq.done): void {
		this.#fs.scandir(item.directory, this.#settings.fsScandirSettings, (error, entries) => {
			if (error !== null) {
				done(error, undefined);
				return;
			}

			for (const entry of entries) {
				this.#handleEntry(entry, item.base);
			}

			done(null, undefined);
		});
	}

	#handleError(error: Error): void {
		if (this.#isDestroyed || !common.isFatalError(this.#settings, error)) {
			return;
		}

		this.#isFatalError = true;
		this.#isDestroyed = true;

		this._emitError(error);
	}

	#handleEntry(entry: Entry, base: string | undefined): void {
		if (this.#isDestroyed || this.#isFatalError) {
			return;
		}

		const fullpath = entry.path;

		if (base !== undefined) {
			entry.path = common.joinPathSegments(base, entry.name, this.#settings.pathSegmentSeparator);
		}

		if (common.isAppliedFilter(this.#settings.entryFilter, entry)) {
			this._emitEntry(entry);
		}

		if (entry.dirent.isDirectory() && common.isAppliedFilter(this.#settings.deepFilter, entry)) {
			this.#pushToQueue(fullpath, base === undefined ? undefined : entry.path);
		}
	}
}
