export const ASSET_BRANCH_OPTIONS = [
  { key: 'VAVA1', label: 'บริษัท วาวา แพค จำกัด สาขา 1' },
  { key: 'VAVA2', label: 'บริษัท วาวา แพค จำกัด สาขา 2' },
  { key: 'VAVA3', label: 'บริษัท วาวา แพค จำกัด สาขา 3' },
]

export const OTHER_ASSET_BRANCH = { key: 'OTHER', label: 'อื่น ๆ / ไม่ระบุสาขา' }

export const getAssetBranchKey = (locationName) => {
  const location = String(locationName || '').toUpperCase()
  if (/VAVA[\s-]?1/.test(location)) return 'VAVA1'
  if (/VAVA[\s-]?2/.test(location)) return 'VAVA2'
  if (/VAVA[\s-]?3/.test(location)) return 'VAVA3'
  return OTHER_ASSET_BRANCH.key
}

export const getAssetBranchLabel = (branchKey) => (
  ASSET_BRANCH_OPTIONS.find((branch) => branch.key === branchKey)?.label
  || OTHER_ASSET_BRANCH.label
)

export const isAssetReportBranch = (branchKey) => ASSET_BRANCH_OPTIONS.some((branch) => branch.key === branchKey)

export const getAllAssetBranches = () => [...ASSET_BRANCH_OPTIONS]
