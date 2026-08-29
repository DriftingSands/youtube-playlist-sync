const ignorelist = [
	'some-id',
	'MsTWpbR_TVE', // riptide unavailable
	'IlDcpgDDxDw', // riptide re-added
]

const ignoremap = {}
for (const item of ignorelist) {
	ignoremap[item] = true;
}

export default ignoremap;
