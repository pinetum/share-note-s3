import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian'
import SharePlugin from './main'

export enum ThemeMode {
  'Same as theme',
  Dark,
  Light
}

export enum TitleSource {
  'Note title',
  'First H1',
  'Frontmatter property'
}

export enum YamlField {
  link,
  updated,
  encrypted,
  unencrypted,
  title,
  expires,
  shareId
}

export interface ShareSettings {
  s3URL: string;
  s3AccessKey: string;
  s3AccessId: string;
  s3Region: string;
  bucket: string;
  publicBaseURL: string;
  uid: string;
  yamlField: string;
  noteWidth: string;
  themeMode: ThemeMode;
  titleSource: TitleSource;
  removeYaml: boolean;
  removeBacklinksFooter: boolean;
  expiry: string;
  clipboard: boolean;
  shareUnencrypted: boolean;
  debug: number;
  cssurl: string;
}

export const DEFAULT_SETTINGS: ShareSettings = {
  s3URL: '',
  s3AccessKey: '',
  s3Region: 'auto',
  s3AccessId: '',
  bucket: '',
  publicBaseURL: '',
  uid: '',
  yamlField: 'share',
  noteWidth: '',
  themeMode: ThemeMode['Same as theme'],
  titleSource: TitleSource['Note title'],
  removeYaml: true,
  removeBacklinksFooter: true,
  expiry: '',
  clipboard: true,
  shareUnencrypted: false,
  debug: 0,
  cssurl: ''
}

export class ShareSettingsTab extends PluginSettingTab {
  plugin: SharePlugin
  apikeyEl: TextComponent

  constructor(app: App, plugin: SharePlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()
    new Setting(containerEl)
      .setName('S3 API settings')
      .setHeading();
    // API key
    new Setting(containerEl)
      .setName('S3 API URL')
      .setDesc('Your S3 API URL')
      .addText(text => text
        .setPlaceholder('https://s3.amazonaws.com....')
        .setValue(this.plugin.settings.s3URL)
        .onChange(async (value) => {
          this.plugin.settings.s3URL = value;
          await this.plugin.saveSettings();
        }));
        new Setting(containerEl)
        .setName('S3 API Region')
        .setDesc('Your S3 API region')
        .addText(text => text
          .setPlaceholder('auto')
          .setValue(this.plugin.settings.s3Region)
          .onChange(async (value) => {
            this.plugin.settings.s3Region = value;
            await this.plugin.saveSettings();
          }));

    new Setting(containerEl)
      .setName('S3 API Access ID')
      .setDesc('Your S3 API Access ID')
      .addText(text => text
        .setPlaceholder('Access ID')
        .setValue(this.plugin.settings.s3AccessId)
        .onChange(async (value) => {
          this.plugin.settings.s3AccessId = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName('S3 API Access Key')
      .setDesc('Your S3 API Access Key')
      .addText(text => text
        .setPlaceholder('Access Key')
        .setValue(this.plugin.settings.s3AccessKey)
        .onChange(async (value) => {
          this.plugin.settings.s3AccessKey = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName('S3 Bucket')
      .setDesc('Your S3 Bucket')
      .addText(text => text
        .setPlaceholder('Bucket')
        .setValue(this.plugin.settings.bucket)
        .onChange(async (value) => {
          this.plugin.settings.bucket = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName('Public Base URL')
      .setDesc('Your S3 Public Base URL')
      .addText(text => text
        .setPlaceholder('https://....')
        .setValue(this.plugin.settings.publicBaseURL)
        .onChange(async (value) => {
          this.plugin.settings.publicBaseURL = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName('S3 API test')
      .setDesc('Test your S3 API connection')
      .addButton(btn => btn
        .setButtonText('Test connection')
        .setCta()
        .onClick(() => {
          this.plugin.checkAuth()
        }));

    new Setting(containerEl)
      .setName(`Troubleshooting`)
      .setDesc('If connection is failed, please check your S3 API CORS Policy.')
      .then(setting => addDocs(setting, 'https://docs.note.sx/notes/theme'))

    new Setting(containerEl)
      .setName('Upload options')
      .setHeading()

    // Local YAML field
    new Setting(containerEl)
      .setName('Frontmatter property prefix')
      .setDesc('The frontmatter property for storing the shared link and updated time. A value of `share` will create frontmatter fields of `share_link` and `share_updated`.')
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.yamlField)
        .setValue(this.plugin.settings.yamlField)
        .onChange(async (value) => {
          this.plugin.settings.yamlField = value || DEFAULT_SETTINGS.yamlField
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName(`⭐ Your shared note theme is "${this.plugin.settings.theme || 'Obsidian default theme'}"`)
      .setDesc('To set a new theme, change the theme in Obsidian to your desired theme and then use the `Force re-upload all data` command. You can change your Obsidian theme after that without affecting the theme for your shared notes.')
      .then(setting => addDocs(setting, 'https://docs.note.sx/notes/theme'))

    // Choose light/dark theme mode
    new Setting(containerEl)
      .setName('Light/Dark mode')
      .setDesc('Choose the mode with which your files will be shared')
      .addDropdown(dropdown => {
        dropdown
          .addOption('Same as theme', 'Same as theme')
          .addOption('Dark', 'Dark')
          .addOption('Light', 'Light')
          .setValue(ThemeMode[this.plugin.settings.themeMode])
          .onChange(async value => {
            this.plugin.settings.themeMode = ThemeMode[value as keyof typeof ThemeMode]
            await this.plugin.saveSettings()
          })
      })

    // Copy to clipboard
    new Setting(containerEl)
      .setName('Copy the link to clipboard after sharing')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.clipboard)
          .onChange(async (value) => {
            this.plugin.settings.clipboard = value
            await this.plugin.saveSettings()
            this.display()
          })
      })

    new Setting(containerEl)
      .setName('Note options')
      .setHeading()

    // Title source
    const defaultTitleDesc = 'Select the location to source the published note title. It will default to the note title if nothing is found for the selected option.'
    const titleSetting = new Setting(containerEl)
      .setName('Note title source')
      .setDesc(defaultTitleDesc)
      .addDropdown(dropdown => {
        for (const enumKey in TitleSource) {
          if (isNaN(Number(enumKey))) {
            dropdown.addOption(enumKey, enumKey)
          }
        }
        dropdown
          .setValue(TitleSource[this.plugin.settings.titleSource])
          .onChange(async value => {
            this.plugin.settings.titleSource = TitleSource[value as keyof typeof TitleSource]
            if (this.plugin.settings.titleSource === TitleSource['Frontmatter property']) {
              titleSetting.setDesc('Set the title you want to use in a frontmatter property called `' + this.plugin.field(YamlField.title) + '`')
            } else {
              titleSetting.setDesc(defaultTitleDesc)
            }
            await this.plugin.saveSettings()
          })
      })

    // Note reading width
    new Setting(containerEl)
      .setName('Note reading width')
      .setDesc('The max width for the content of your shared note, accepts any CSS unit. Leave this value empty if you want to use the theme\'s width.')
      .addText(text => text
        .setValue(this.plugin.settings.noteWidth)
        .onChange(async (value) => {
          this.plugin.settings.noteWidth = value
          await this.plugin.saveSettings()
        }))

    // Strip frontmatter
    new Setting(containerEl)
      .setName('Remove published frontmatter/YAML')
      .setDesc('Remove frontmatter/YAML/properties from the shared note')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.removeYaml)
          .onChange(async (value) => {
            this.plugin.settings.removeYaml = value
            await this.plugin.saveSettings()
            this.display()
          })
      })

    // Strip backlinks footer
    new Setting(containerEl)
      .setName('Remove backlinks footer')
      .setDesc('Remove backlinks footer from the shared note')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.removeBacklinksFooter)
          .onChange(async (value) => {
            this.plugin.settings.removeBacklinksFooter = value
            await this.plugin.saveSettings()
            this.display()
          })
      })

    // Share encrypted by default
    new Setting(containerEl)
      .setName('Share as encrypted by default')
      .setDesc('If you turn this off, you can enable encryption for individual notes by adding a `share_encrypted` checkbox into a note and ticking it.')
      .addToggle(toggle => {
        toggle
          .setValue(!this.plugin.settings.shareUnencrypted)
          .onChange(async (value) => {
            this.plugin.settings.shareUnencrypted = !value
            await this.plugin.saveSettings()
            this.display()
          })
      })
      .then(setting => addDocs(setting, 'https://docs.note.sx/notes/encryption'))

    // Default note expiry
    new Setting(containerEl)
      .setName('Default note expiry')
      .setDesc('If you want, your notes can auto-delete themselves after a period of time. You can set this as a default for all notes here, or you can set it on a per-note basis.')
      .addText(text => text
        .setValue(this.plugin.settings.expiry)
        .onChange(async (value) => {
          this.plugin.settings.expiry = value
          await this.plugin.saveSettings()
        }))
      .then(setting => addDocs(setting, 'https://docs.note.sx/notes/self-deleting-notes'))
  }
}

function addDocs(setting: Setting, url: string) {
  setting.descEl.createEl('br')
  setting.descEl.createEl('a', {
    text: 'View the documentation',
    href: url
  })
}
