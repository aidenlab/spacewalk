import {FileUtils, URIUtils} from 'igv-utils'

let traceURLlModal
let traceSelectModal
let ensembleGroupModal
let ensembleGroupSelectElement

function createSpacewalkFileLoaders ({ rootContainer, localFileInput, urlLoadModalId, traceModalId, ensembleGroupModalId, dropboxButton, fileLoader, getEnsembleIngestionController }) {

    // local file
    localFileInput.addEventListener('change', async () => {
        const [ file ] = localFileInput.files
        localFileInput.value = ''
        await fileLoader.load(file)
    });

    // URL
    traceURLlModal = createAndConfigureURLLoadModal(rootContainer, urlLoadModalId, async path => await fileLoader.load(path))

    // trace from select list
    traceSelectModal = createAndConfigureTraceSelectModal(rootContainer, traceModalId, async path => await fileLoader.load(path))

    // Ensemble group from select list
    ensembleGroupModal = createAndConfigureEnsembleGroupSelectModal(rootContainer, ensembleGroupModalId, getEnsembleIngestionController)

    // Dropbox
    dropboxButton.addEventListener('click', () => {

        const config =
            {
                success: async dbFiles => {

                    const paths = dbFiles.map(dbFile => dbFile.link)
                    const [ path ] = paths
                    await fileLoader.load(path)
                },
                cancel: () => {},
                linkType: 'preview',
                multiselect: false,
                folderselect: false,
            };

        Dropbox.choose( config );

    });

}

async function SpacewalkGetFilename(path){

    if (path instanceof File) {
        return path.name
    } else {
        const result = URIUtils.parseUri(path)
        return result.file;
    }

}

function createAndConfigureTraceSelectModal(parentElement, traceModalId, fileLoader) {

    const html =
        `<div id="${traceModalId}" class="modal fade">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title">Select File</div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div>
                        <div class="input-group my-3">
                            <div class="spinner-border" style="display: none;">
                                <!-- spinner border-radius: .25rem; -->
                            </div>
                            <select class="form-select" data-live-search="true" title="Select an ensemble" data-width="100%">
                                <option value="" disabled selected hidden>Please select</option>
                                <option value="https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/A549_chr21-28-30Mb.sw">A549 chr21:28-30</option>
                                <option value="https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/HCT116_chr21-28-30Mb_untreated.sw">HCT116 untreated chr21:28-30</option>
                                <option value="https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/IMR90_chr21-18-20Mb.sw">IMR90 chr21:18-20</option>
                                <option value="https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/IMR90_chr21-28-30Mb.sw">IMR90 chr21:28-30</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    const fragment = document.createRange().createContextualFragment(html)

    const traceSelectModalElement =  fragment.firstChild

    parentElement.appendChild(traceSelectModalElement)

    const modal = new bootstrap.Modal(traceSelectModalElement)

    const selectElement = traceSelectModalElement.querySelector('select')

    selectElement.addEventListener('change', event => {

        event.stopPropagation()

        if ('' !== selectElement.value) {
            fileLoader(selectElement.value);
        }

        modal.hide();

    })

    return modal

}

function createAndConfigureEnsembleGroupSelectModal(parentElement, ensembleGroupModalId, getEnsembleIngestionController) {

    const modalElement = createEnsembleGroupModalElement(ensembleGroupModalId)
    parentElement.appendChild(modalElement)

    const modal = new bootstrap.Modal(modalElement)

    const selectElement = modalElement.querySelector('select')
    ensembleGroupSelectElement = selectElement

    selectElement.addEventListener('change', async event => {

        event.stopPropagation()

        modal.hide()

        try {
            await getEnsembleIngestionController().ingestEnsembleGroup(selectElement.value)
        } catch (error) {
            console.error('Failed to load ensemble group:', error)
        }

    })

    return modal
}

// Populate the ensemble-group <select> with the keys discovered in a multi-group
// .sw. SWBDatasource calls this directly on load — mirroring its direct
// updateEnsembleGroupDisplay() call in the same path (replaces the former
// DidLoadSWBEnsembleGroup event, whose sole subscriber was this select).
function updateEnsembleGroupSelect(ensembleGroupKeys) {

    // discard pre-exisiting option elements
    ensembleGroupSelectElement.innerHTML = ''

    ensembleGroupSelectElement.appendChild(createPlaceholderOptionElement())

    // sort
    const sorted = ensembleGroupKeys.sort((a, b) => {
        // Extract the first number after the initial string
        const firstNumberA = parseInt(a.match(/^\D+(\d+)/)?.[1] || 0, 10);
        const firstNumberB = parseInt(b.match(/^\D+(\d+)/)?.[1] || 0, 10);

        // Extract the second number, whether it's foo23, foo_23, or foo_03
        const secondNumberA = parseInt(a.match(/\D(\d+)$/)?.[1] || 0, 10);
        const secondNumberB = parseInt(b.match(/\D(\d+)$/)?.[1] || 0, 10);

        // Sort by the first number, then by the second number
        return firstNumberA - firstNumberB || secondNumberA - secondNumberB;
    });

    for (const key of sorted ) {
        const html = `<option value=\"${ key }\">${ key }</option>`
        const fragment = document.createRange().createContextualFragment(html)
        ensembleGroupSelectElement.appendChild(fragment.firstChild)
    }
}

function createEnsembleGroupModalElement(ensembleGroupModalId) {

    const html =
        `<div id="${ ensembleGroupModalId }" class="modal fade">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title">Ensemble Group Selection</div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div>
                        <div class="input-group my-3">
                            <div class="spinner-border" style="display: none;"></div>
                            <select class="form-select" data-live-search="true" title="Select an ensemble group" data-width="100%"></select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    const fragment = document.createRange().createContextualFragment(html)

    return fragment.firstChild
}

function createPlaceholderOptionElement() {
    const placeholderOption = document.createElement('option')
    placeholderOption.text = 'Please select'
    placeholderOption.disabled = true
    placeholderOption.selected = true
    placeholderOption.hidden = true
    return placeholderOption
}

function createAndConfigureURLLoadModal(root, id, input_handler) {

    const html =
        `<div id="${id}" class="modal fade">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-title">Load URL</div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <input type="text" class="form-control" placeholder="Enter URL">
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    root.insertAdjacentHTML('beforeend', html);

    const modalElement = document.getElementById(id);
    const inputElement = modalElement.querySelector('input');

    inputElement.addEventListener('change', function () {
        const path = inputElement.value;
        inputElement.value = "";

        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        modalInstance.hide();

        input_handler(path);
    });

    return new bootstrap.Modal(modalElement)
}

export { createSpacewalkFileLoaders, createAndConfigureURLLoadModal, updateEnsembleGroupSelect }
