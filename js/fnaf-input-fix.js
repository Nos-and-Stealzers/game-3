(function () {
    function installFnafInputStability(canvasId) {
        const id = canvasId || 'MMFCanvas';

        function getCanvas() {
            return document.getElementById(id);
        }

        function focusCanvas() {
            const canvas = getCanvas();
            if (!canvas) return;
            canvas.setAttribute('tabindex', '0');
            try {
                canvas.focus({ preventScroll: true });
            } catch (error) {
                canvas.focus();
            }
        }

        function dispatchMouseUp(target) {
            target.dispatchEvent(new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0,
                buttons: 0
            }));
        }

        function releaseStuckInput() {
            const canvas = getCanvas();
            if (!canvas) return;

            // Some runtimes can miss mouseup after tab switches/fullscreen changes.
            dispatchMouseUp(canvas);
            dispatchMouseUp(document);
            dispatchMouseUp(window);
        }

        document.addEventListener('mousedown', function (event) {
            const canvas = getCanvas();
            if (!canvas) return;
            if (event.target === canvas) {
                focusCanvas();
            }
        }, true);

        window.addEventListener('blur', releaseStuckInput);

        window.addEventListener('focus', function () {
            setTimeout(function () {
                releaseStuckInput();
                focusCanvas();
            }, 0);
        });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                releaseStuckInput();
                return;
            }
            setTimeout(function () {
                releaseStuckInput();
                focusCanvas();
            }, 0);
        });

        document.addEventListener('fullscreenchange', function () {
            setTimeout(function () {
                releaseStuckInput();
                focusCanvas();
            }, 0);
        });

        window.addEventListener('contextmenu', function () {
            setTimeout(releaseStuckInput, 0);
        }, true);

        window.addEventListener('touchend', function () {
            setTimeout(function () {
                releaseStuckInput();
                focusCanvas();
            }, 0);
        }, { passive: true });

        return {
            focusCanvas: focusCanvas,
            releaseStuckInput: releaseStuckInput
        };
    }

    window.installFnafInputStability = installFnafInputStability;
})();
