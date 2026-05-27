# Spacewalk

Spacewalk is an interactive 3D visualization application for super-resolution microscopy data. 
Spacewalk supports integrated genomic analysis via a fully featured IGV genomics browser [igv.js](https://github.com/igvteam/igv.js) 
and Juicebox Hi-C map viewer [juicebox.js](https://github.com/aidenlab/juicebox.js)

[![Netlify Status](https://api.netlify.com/api/v1/badges/501c7787-a366-4d4c-a5aa-e768be19ccfc/deploy-status)](https://app.netlify.com/projects/spacewalk-site/deploys)

## Try It Now

Spacewalk is hosted at [Aiden  Lab](https://aidenlab.org). Launch the main by clicking [here](https://aidenlab.org/spacewalk).

Experience Spacewalk immediately with these demos:

- **[Ball & Stick Demo](https://tinyurl.com/25audeaa)**  
  Chromatin centroids are rendered as balls, each colored according to its genomic location. 
  Sticks (cylinders) connect the balls in the order they appear along the genomic range.

- **[Point Cloud Demo](https://tinyurl.com/23lwr5u6)**  
The point cloud is rendered as a collection of 3D point clusters, each point cluster corresponds to a specific genomic extent and is colored according to the genomic location of that extent.

## Documentation

Visit our [Documentation Site](https://aidenlab.github.io/spacewalk/) for:
- User Guide
- Developer Guide
- File Format Specifications
- Example Data

## Features

- Interactive 3D visualization of genomic data
- Multiple visualization modes:
  - Ball & Stick for structural connections
  - Point Cloud for dense spatial data
- Integrated genomic views
- Shareable visualization states
- Support for various data formats
- Direct file loading via URL parameter or cross-origin `postMessage`

## Loading Data from External Tools

Spacewalk can receive data files directly from external web applications, enabling seamless tool-to-viewer workflows without file downloads.

### URL Parameter

Load a hosted file by passing its URL as a query parameter:

```
https://aidenlab.org/spacewalk/?file=https://example.com/data.sw&traceKey=0
```

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `file` | Yes | — | URL to a .sw/.swb file |
| `traceKey` | No | `0` | Trace index to display |
| `ensembleGroupKey` | No | — | Ensemble group to load |

### postMessage API

Web applications that generate Spacewalk files in memory can send them directly without uploading or downloading. The sending app opens Spacewalk in a new tab, waits for a readiness signal, then transfers the file bytes via `postMessage`. See [notes/external-file-loading.md](notes/external-file-loading.md) for the full protocol specification.

[swtool](https://github.com/aidenlab/swtool) is the first application to use this capability — after converting a `.swt` file, users can click "Open in Spacewalk" to visualize the result immediately.

## Development

### Requirements
- Node.js
- npm

### Setup
```bash
git clone https://github.com/aidenlab/spacewalk.git
cd spacewalk
npm install
npm start
```

### Build
```bash
npm run build
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Version

Current version: 7.0.0
