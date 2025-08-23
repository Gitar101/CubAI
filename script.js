MathJax = {
    tex: {
        inlineMath: [['$', '$'], ['\$', '\$']]
    },
    svg: {
        fontCache: 'global'
    }
};

function toggleSolution() {
    const solutionDiv = document.getElementById('solution');
    solutionDiv.classList.toggle('active');
    const button = document.querySelector('.btn-visualize');
    if (solutionDiv.classList.contains('active')) {
        button.textContent = 'Hide Derivation';
        // Trigger MathJax re-render for newly visible content
        if (window.MathJax) {
            MathJax.typesetPromise([solutionDiv]).catch((err) => console.error("MathJax typesetting failed:", err));
        }
    } else {
        button.textContent = 'Visualize Derivation';
    }
}

// Attach event listener after the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const visualizeButton = document.querySelector('.btn-visualize');
    if (visualizeButton) {
        visualizeButton.addEventListener('click', toggleSolution);
    }
});