import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveGenomeAssembly } from './genomeAssembly.js'

// Invisible bookkeeping: which assembly a .sw header's genome string resolves to.
// Runs against the bundled genome list — no IGV browser, no DOM.
describe('resolveGenomeAssembly', () => {

    afterEach(() => vi.restoreAllMocks())

    it('resolves a known genome to itself', () => {
        expect(resolveGenomeAssembly('hg38')).toBe('hg38')
        expect(resolveGenomeAssembly('mm10')).toBe('mm10')
    })

    it('maps the woolly mammoth header to Loxafr3.0_HiC', () => {
        expect(resolveGenomeAssembly('woolly mammoth')).toBe('Loxafr3.0_HiC')
    })

    it('warns and falls back to hg19 for an unknown genome', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(resolveGenomeAssembly('notAGenome')).toBe('hg19')
        expect(warn).toHaveBeenCalledWith('Warning: Unrecognized genome notAGenome')
    })

    it('warns and falls back to hg19 for a missing genome', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(resolveGenomeAssembly(undefined)).toBe('hg19')
        expect(warn).toHaveBeenCalledWith('Warning: Unrecognized genome undefined')
    })
})
