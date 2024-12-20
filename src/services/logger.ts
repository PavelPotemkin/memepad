export const loggerService = {
    log: (message: string) => {
        console.log(message);
    },

    error: (message: string) => {
        console.error(message);
    },

    warn: (message: string) => {
        console.warn(message);
    }
}