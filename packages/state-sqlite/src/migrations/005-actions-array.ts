import type { Migration } from "./types.js";

/** Convert legacy object-shaped actions JSON to ordered arrays. */
export const migration005ActionsArray: Migration = {
  id: "005_actions_array",
  sql(ctx) {
    return `
      UPDATE ${ctx.table.sql}
      SET actions = (
        SELECT COALESCE(json_group_array(obj), json_array())
        FROM (
          SELECT json_object(
            'id', 'approve',
            'label', json_extract(actions, '$.submit.label'),
            'style', json_extract(actions, '$.submit.style'),
            'fields', COALESCE(json_extract(actions, '$.submit.fields'), json_object())
          ) AS obj
          WHERE json_extract(actions, '$.submit') IS NOT NULL
          UNION ALL
          SELECT json_object(
            'id', 'deny',
            'label', json_extract(actions, '$.deny.label'),
            'style', json_extract(actions, '$.deny.style'),
            'fields', COALESCE(json_extract(actions, '$.deny.fields'), json_object())
          )
          WHERE json_extract(actions, '$.deny') IS NOT NULL
        )
      )
      WHERE actions IS NOT NULL AND json_type(actions) = 'object';

      UPDATE ${ctx.table.batchesSql}
      SET actions = (
        SELECT COALESCE(json_group_array(obj), json_array())
        FROM (
          SELECT json_object(
            'id', 'approve',
            'label', json_extract(actions, '$.submit.label'),
            'style', json_extract(actions, '$.submit.style'),
            'fields', COALESCE(json_extract(actions, '$.submit.fields'), json_object())
          ) AS obj
          WHERE json_extract(actions, '$.submit') IS NOT NULL
          UNION ALL
          SELECT json_object(
            'id', 'deny',
            'label', json_extract(actions, '$.deny.label'),
            'style', json_extract(actions, '$.deny.style'),
            'fields', COALESCE(json_extract(actions, '$.deny.fields'), json_object())
          )
          WHERE json_extract(actions, '$.deny') IS NOT NULL
        )
      )
      WHERE actions IS NOT NULL AND json_type(actions) = 'object';
    `.trim();
  },
};
