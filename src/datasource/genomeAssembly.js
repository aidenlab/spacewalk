import genomes from '../resources/genomes.json'

// The bundled genome list is the source of truth for .sw assemblies. It is also
// IGVPanel's default genomeList, but is read directly so the .sw datasource can
// resolve an assembly without an IGV panel.
const knownGenomeIDs = new Set(genomes.map(({ id }) => id))

function resolveGenomeAssembly(headerGenome) {

    const genomeID = woollyMammothGenomeIDHack(headerGenome)
    if (knownGenomeIDs.has(genomeID)) {
        return genomeID
    }

    console.warn(`Warning: Unrecognized genome ${ headerGenome || 'undefined' }`)
    return 'hg19'
}

function woollyMammothGenomeIDHack(str) {
    return 'woolly mammoth' === str ? 'Loxafr3.0_HiC' : str
}

export { resolveGenomeAssembly }
