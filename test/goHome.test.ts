import { chromium, Page, Browser, BrowserContext, Cookie } from "playwright"
import { createCookieIfDoesntExist } from "../src/common/util"
import { hash } from "../src/node/util"

async function setTimeoutPromise(milliseconds: number): Promise<void> {
  return new Promise((resolve, _) => {
    setTimeout(() => {
      resolve()
    }, milliseconds)
  })
}

describe("login", () => {
  let browser: Browser
  let page: Page
  let context: BrowserContext

  beforeAll(async () => {
    browser = await chromium.launch()
    // Create a new context with the saved storage state
    const storageState = JSON.parse(process.env.STORAGE || "")

    const cookieToStore = {
      sameSite: "Lax" as const,
      name: "key",
      value: hash(process.env.PASSWORD || ""),
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
    }

    // For some odd reason, the login method used in globalSetup.ts doesn't always work
    // I don't know if it's on playwright clearing our cookies by accident
    // or if it's our cookies disappearing.
    // This means we need an additional check to make sure we're logged in.
    // We do this by manually adding the cookie to the browser environment
    // if it's not there at the time the test starts
    const cookies: Cookie[] = storageState.cookies || []
    // If the cookie exists in cookies then
    // this will return the cookies with no changes
    // otherwise if it doesn't exist, it will create it
    // hence the name maybeUpdatedCookies
    const maybeUpdatedCookies = createCookieIfDoesntExist(cookies, cookieToStore)

    context = await browser.newContext({
      storageState: { cookies: maybeUpdatedCookies },
      recordVideo: { dir: "./test/videos/" },
    })
  })

  afterAll(async () => {
    // Remove password from local storage
    await context.clearCookies()

    await browser.close()
    await context.close()
  })

  beforeEach(async () => {
    page = await context.newPage()
  })

  // NOTE: this test will fail if you do not run code-server with --home $CODE_SERVER_ADDRESS/healthz
  it("should see a 'Go Home' button in the Application Menu that goes to /healthz", async () => {
    let requestedGoHomeUrl = false

    const GO_HOME_URL = `${process.env.CODE_SERVER_ADDRESS}/healthz`
    page.on("request", (request) => {
      // This ensures that we did make a request to the GO_HOME_URL
      // Most reliable way to test button
      // because we don't care if the request has a response
      // only that it was made
      if (request.url() === GO_HOME_URL) {
        requestedGoHomeUrl = true
      }
    })
    // Sometimes a dialog shows up when you navigate
    // asking if you're sure you want to leave
    // so we listen if it comes, we accept it
    page.on("dialog", (dialog) => dialog.accept())

    // waitUntil: "domcontentloaded"
    // In case the page takes a long time to load
    await page.goto(process.env.CODE_SERVER_ADDRESS || "http://localhost:8080", { waitUntil: "domcontentloaded" })

    // Click the Home menu
    await page.click(".home-bar ul[aria-label='Home'] li")
    // See the Go Home button
    const goHomeButton = "a.action-menu-item span[aria-label='Go Home']"
    expect(await page.isVisible(goHomeButton))

    // Click it and navigate to /healthz
    // NOTE: ran into issues of it failing intermittently
    // without having button: "middle"
    await page.click(goHomeButton, { button: "middle" })
    // Give it 3 seconds for request to be sent and completed and for our value to update
    await setTimeoutPromise(3000)
    expect(requestedGoHomeUrl).toBe(true)
  })
})
