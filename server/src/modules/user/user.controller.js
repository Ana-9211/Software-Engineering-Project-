// ProfileController: HTTP only. All rules live in UserService.
function createUserController({ userService }) {
  return {
    getProfile: async (req, res) => res.json(await userService.getProfile(req.user.id)),
    updateProfile: async (req, res) => res.json(await userService.updateProfile(req.user.id, req.valid.body)),
    addAddress: async (req, res) => res.status(201).json(await userService.addAddress(req.user.id, req.valid.body)),
    updateAddress: async (req, res) =>
      res.json(await userService.updateAddress(req.user.id, req.valid.params.addressId, req.valid.body)),
    removeAddress: async (req, res) => {
      await userService.removeAddress(req.user.id, req.valid.params.addressId);
      res.status(204).end();
    },
  };
}

module.exports = { createUserController };
