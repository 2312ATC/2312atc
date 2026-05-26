import { existsSync, promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';
import { z, type ZodType } from 'astro/zod';

export function orderedListSchema<TItem extends ZodType>(itemSchema: TItem) {
	return z.object({ items: z.array(itemSchema) });
}

export type OrderedListData<TItem extends ZodType> = z.infer<
	ReturnType<typeof orderedListSchema<TItem>>
>;

interface OrderedListLoaderOptions<TItem extends ZodType> {
	file: string;
	itemSchema: TItem;
	markdownField?: string;
	htmlField?: string;
}

export function orderedListLoader<TItem extends ZodType>({
	file,
	itemSchema,
	markdownField = 'body',
	htmlField = 'bodyHtml',
}: OrderedListLoaderOptions<TItem>): Loader {
	const listSchema = orderedListSchema(itemSchema);
	type EntryInput = z.input<typeof listSchema>;

	return {
		name: `ordered-list-${file}`,
		async load({ store, renderMarkdown, config, logger, watcher }) {
			const url = new URL(file, config.root);

			async function sync(absoluteFilePath: string) {
				let data: { items?: unknown[] };
				try {
					data = JSON.parse(await fs.readFile(absoluteFilePath, 'utf-8'));
				} catch (error) {
					logger.error(`Error reading ${file}`);
					logger.debug(String(error));
					return;
				}

				const items = Array.isArray(data.items) ? data.items : [];
				if (items.length === 0) {
					logger.warn(`No items found in ${file}`);
				}

				const processed: EntryInput['items'] = await Promise.all(
					items.map(async (item) => {
						const record = { ...(item as Record<string, unknown>) } as EntryInput['items'][number];
						const markdown = record[markdownField as keyof typeof record];

						if (typeof markdown === 'string' && markdown) {
							const { html } = await renderMarkdown(markdown);
							(record as Record<string, unknown>)[htmlField] = html;
						}

						return record;
					}),
				);

				const parsed = listSchema.parse({ items: processed });
				store.clear();
				store.set({ id: 'items', data: parsed, filePath: file });
			}

			if (!existsSync(url)) {
				logger.error(`File not found: ${file}`);
				return;
			}

			const absoluteFilePath = fileURLToPath(url);
			await sync(absoluteFilePath);

			watcher?.add(absoluteFilePath);
			watcher?.on('change', async (changedPath) => {
				if (changedPath === absoluteFilePath) {
					logger.info(`Reloading data from ${file}`);
					await sync(filePath);
				}
			});
		},
	};
}
