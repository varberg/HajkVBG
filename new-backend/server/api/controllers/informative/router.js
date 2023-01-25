import * as express from "express";
import controller from "./controller";
import restrictAdmin from "../../middlewares/restrict.admin";

export default express
  .Router()
  .get("/load/:name", controller.getByName)
  .get("/loaddocument/:name", controller.getByNameDoc)
  .get("/loaddocument/:folder/:name", controller.getByNameDocFolder)
  .use(restrictAdmin) // All routes that follow are admin-only!
  .post("/create", controller.create) // FIXME: Remove POST
  .put("/create", controller.create) // PUT is correct here, as this operation is idempotent
  .post("/createdoc", controller.createDoc)
  .post("/createfolder", controller.createFolder)
  .get("/folderlist", controller.folderlist)
  .get("/documentfolderlist", controller.documentFolderList)
  .get("/documentfolderlist/:name", controller.documentFolderList)
  .delete("/delete/:name", controller.deleteByName)
  .get("/list", controller.list)
  .get("/list/:name", controller.list) // FIXME: For now, the name paramter is ignored - should list only documents connected to specified map
  .post("/save/:name", controller.saveByName) // FIXME: Remove POST
  .post("/savedoc/:folder/:name", controller.saveByNameDocFolder)
  .post("/savedoc/:name", controller.saveByNameDoc)
  .put("/save/:name", controller.saveByName); // PUT is correct here, as this operation is idempotent
