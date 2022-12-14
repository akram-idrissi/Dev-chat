const { verify } = require("jsonwebtoken");

module.exports = {
    getUser: (cookies, socket = null) => {
        let user = null;
        const jat = cookies.jat;
        verify(jat, process.env.ACCESS_SECRET_TOKEN, async (error, payload) => {
            if (error) {
                return null;
            }
            user = payload.user;
            if (socket) user["socketID"] = socket.id;
        });
        return user;
    },
};
