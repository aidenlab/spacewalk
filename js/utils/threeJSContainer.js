function getThreeJSContainerRect() {
    const container = document.querySelector('#spacewalk-threejs-canvas-container');
    return container.getBoundingClientRect();
}

export { getThreeJSContainerRect }
