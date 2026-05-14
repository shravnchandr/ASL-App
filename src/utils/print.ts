export const print = {
    printPage(): void {
        window.print();
    },

    getFormattedDate(): string {
        return new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    },

    preparePrint(): void {
        document.body.classList.add('printing');
    },

    cleanupPrint(): void {
        document.body.classList.remove('printing');
    },

    setupPrintListeners(): () => void {
        const beforePrint = () => this.preparePrint();
        const afterPrint = () => this.cleanupPrint();

        window.addEventListener('beforeprint', beforePrint);
        window.addEventListener('afterprint', afterPrint);

        return () => {
            window.removeEventListener('beforeprint', beforePrint);
            window.removeEventListener('afterprint', afterPrint);
        };
    },
};
