export class ApiError extends Error {
    status;
    code;
    details;
    constructor(params) {
        super(params.message);
        this.status = params.status;
        this.code = params.code;
        this.details = params.details;
    }
}
