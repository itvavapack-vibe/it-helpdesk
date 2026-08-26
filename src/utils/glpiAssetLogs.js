import { ASSET_STATUS, createAssetStatusEvent } from './assetStatus.js'

export const GLPI_LOCATION_LOG_OPTION = 3
export const GLPI_GROUP_LOG_OPTION = 71

export const cleanGlpiLogValue = (value) => String(value || '')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&gt;/gi, '>')
  .replace(/&lt;/gi, '<')
  .replace(/\s*\(\d+\)\s*$/, '')
  .replace(/\s+/g, ' ')
  .trim()

export const buildTransferEventsFromGlpiLogs = (computer, logs) => logs.flatMap((log) => {
  const option = Number(log.id_search_option)
  if (![GLPI_LOCATION_LOG_OPTION, GLPI_GROUP_LOG_OPTION].includes(option)) return []

  const previousValue = cleanGlpiLogValue(log.old_value)
  const nextValue = cleanGlpiLogValue(log.new_value)
  if (!previousValue || !nextValue || previousValue.toLowerCase() === nextValue.toLowerCase()) return []

  const previousAsset = {
    ...computer,
    glpi_id: Number(computer.id ?? computer.glpi_id),
    locations_id: option === GLPI_LOCATION_LOG_OPTION ? previousValue : computer.locations_id,
    groups_id: option === GLPI_GROUP_LOG_OPTION ? previousValue : computer.groups_id,
  }
  const changedAsset = {
    ...computer,
    glpi_id: Number(computer.id ?? computer.glpi_id),
    locations_id: option === GLPI_LOCATION_LOG_OPTION ? nextValue : computer.locations_id,
    groups_id: option === GLPI_GROUP_LOG_OPTION ? nextValue : computer.groups_id,
  }
  return [{
    ...createAssetStatusEvent({
      asset: changedAsset,
      previousAsset,
      status: ASSET_STATUS.TRANSFERRED,
      eventDate: log.date_mod,
      now: new Date(),
    }),
    event_key: `glpi-log-${Number(log.id)}`,
  }]
})
